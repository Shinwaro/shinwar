/* The damage pipeline. There is exactly one.
 *
 * An ordered array of named pure steps. `previewDamage` and the resolver call
 * `computeDamage` — the same function, not two functions that agree. A preview
 * that can disagree with the result is the fastest way to make a game feel
 * unfair, so this is structurally impossible rather than merely avoided.
 *
 * Every step records what it did. That itemisation is what lets the UI show
 * `6 base +4 IAI x1.5 Vulnerable = 15` and what lets the combat log answer
 * "why did I take 19 damage" without anyone guessing.
 *
 * Never write a second damage calculation anywhere.
 */

import type { CombatState, EnemyState, GameState, StatusStack } from '../types.ts';
import { appendLog, withCombat, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { FOCUS_DAMAGE_PER_STACK, STANCES } from '../../content/balance.ts';
import { enemies as enemyTable, statuses as statusTable } from '../../content/registry.ts';

export type Combatant = { readonly kind: 'player' } | { readonly kind: 'enemy'; readonly uid: string };

export const PLAYER: Combatant = { kind: 'player' };

export function enemyTarget(uid: string): Combatant {
  return { kind: 'enemy', uid };
}

export function sameCombatant(a: Combatant, b: Combatant): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'player' || (b.kind === 'enemy' && a.uid === b.uid);
}

export type DamageStepKind = 'base' | 'add' | 'mult' | 'reduce' | 'block' | 'floor';

export interface DamageStep {
  readonly label: string;
  readonly kind: DamageStepKind;
  /** The factor, for multiplicative steps. `null` otherwise. */
  readonly factor: number | null;
  /** The change this step made. */
  readonly delta: number;
  /** The running total after this step. */
  readonly amount: number;
}

export interface DamageBreakdown {
  readonly base: number;
  /** After every step except Block — the number an intent telegraphs. */
  readonly beforeBlock: number;
  readonly blocked: number;
  /** What actually comes off HP. */
  readonly toHull: number;
  readonly steps: readonly DamageStep[];
  readonly focusConsumed: number;
}

export interface DamageInput {
  readonly amount: number;
  readonly attacker: Combatant;
  readonly target: Combatant;
  /** Attacks take the stance modifiers and can consume Focus. Burn and thorns do not. */
  readonly isAttack: boolean;
  /**
   * `combat.attacksThisTurn` at the moment of this instance. The IAI passive
   * fires on 0 only. Ignored when the attacker is an enemy.
   */
  readonly attackOrdinal: number;
  /** Only the first instance of an attack spends the Focus stack. */
  readonly consumesFocus: boolean;
}

/* ---------- reading the combatants ---------- */

function statusesOf(combat: CombatState, who: Combatant): readonly StatusStack[] {
  if (who.kind === 'player') return combat.statuses;
  return combat.enemies.find((enemy) => enemy.uid === who.uid)?.statuses ?? [];
}

function blockOf(combat: CombatState, who: Combatant): number {
  if (who.kind === 'player') return combat.block;
  return combat.enemies.find((enemy) => enemy.uid === who.uid)?.block ?? 0;
}

/** Every status on this combatant that feeds the named pipeline field. */
function namedStatuses(
  stacks: readonly StatusStack[],
  field: 'damageDealtFlat' | 'damageDealtMult' | 'damageTakenMult',
): { readonly name: string; readonly value: number; readonly stacks: number }[] {
  const out: { name: string; value: number; stacks: number }[] = [];
  for (const held of stacks) {
    const def = statusTable.find(held.status);
    const value = def?.[field];
    if (value === undefined) continue;
    out.push({ name: def?.name ?? held.status, value, stacks: held.stacks });
  }
  return out;
}

/* ---------- the pipeline ----------
   Seven named steps, in this order, always. Adding a source of damage
   modification means adding it to the step it belongs in — never a special
   case somewhere else. */

interface Ctx {
  readonly amount: number;
  readonly steps: readonly DamageStep[];
  readonly focusConsumed: number;
}

function record(
  ctx: Ctx,
  label: string,
  kind: DamageStepKind,
  amount: number,
  factor: number | null = null,
): Ctx {
  return {
    ...ctx,
    amount,
    steps: [...ctx.steps, { label, kind, factor, delta: amount - ctx.amount, amount }],
  };
}

export function computeDamage(state: GameState, input: DamageInput): DamageBreakdown {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) {
    throw new Error('damage: computeDamage called outside a combat');
  }

  const attackerStatuses = statusesOf(combat, input.attacker);
  const targetStatuses = statusesOf(combat, input.target);
  const playerAttacking = input.attacker.kind === 'player';

  /* 1 — base */
  let ctx: Ctx = { amount: 0, steps: [], focusConsumed: 0 };
  ctx = record(ctx, 'base', 'base', input.amount);

  /* 2 — Focus. Attacks only, first instance only, player only. */
  if (playerAttacking && input.isAttack && input.consumesFocus && combat.focus > 0) {
    const bonus = combat.focus * FOCUS_DAMAGE_PER_STACK;
    ctx = { ...record(ctx, `Focus ${combat.focus}`, 'add', ctx.amount + bonus), focusConsumed: combat.focus };
  }

  /* 3 — flat additives: Strength-likes, then the stance passive. */
  for (const status of namedStatuses(attackerStatuses, 'damageDealtFlat')) {
    const delta = status.value * status.stacks;
    if (delta === 0) continue;
    ctx = record(ctx, `${status.name} ${status.stacks}`, 'add', ctx.amount + delta);
  }

  if (playerAttacking && input.isAttack) {
    const stance = STANCES[combat.stance];
    if (stance.firstAttackBonus > 0 && input.attackOrdinal === 0) {
      ctx = record(ctx, `${stance.name} first attack`, 'add', ctx.amount + stance.firstAttackBonus);
    }
    if (stance.attackPenalty > 0) {
      ctx = record(ctx, stance.name, 'add', ctx.amount - stance.attackPenalty);
    }
  }

  /* 4 — multiplicatives: what the attacker suffers, then what the target invites. */
  for (const status of namedStatuses(attackerStatuses, 'damageDealtMult')) {
    const factor = Math.pow(status.value, status.stacks);
    ctx = record(ctx, status.name, 'mult', ctx.amount * factor, factor);
  }
  for (const status of namedStatuses(targetStatuses, 'damageTakenMult')) {
    const factor = Math.pow(status.value, status.stacks);
    ctx = record(ctx, status.name, 'mult', ctx.amount * factor, factor);
  }

  /* 5 — target-side flat reductions: armour, plating. None at M1; the step is
     here so the module that adds one has an obvious and correct home. */

  /* 6 — Block absorbs. Rounded down first: block is always an integer, so
     `floor(x) - b` and `floor(x - b)` agree, and this keeps the number the log
     reports for "blocked" an integer rather than a fraction. */
  const beforeBlock = Math.max(0, Math.floor(ctx.amount));
  ctx = record(ctx, 'round down', 'floor', beforeBlock);

  const available = blockOf(combat, input.target);
  const blocked = Math.min(available, beforeBlock);
  if (available > 0) {
    ctx = record(ctx, `Block ${available}`, 'block', beforeBlock - blocked);
  }

  /* 7 — floor at 0 */
  const toHull = Math.max(0, ctx.amount);
  if (toHull !== ctx.amount) ctx = record(ctx, 'floor at 0', 'floor', toHull);

  return {
    base: input.amount,
    beforeBlock,
    blocked,
    toHull,
    steps: ctx.steps,
    focusConsumed: ctx.focusConsumed,
  };
}

/**
 * The preview. Deliberately an alias rather than its own implementation — if
 * this ever grows a body of its own, the guarantee is gone.
 */
export const previewDamage = computeDamage;

/* ---------- applying it ----------
   Resolution lives in this file too, so it is impossible to reach the "write
   the damage down" step without having gone through `computeDamage` first. */

export function livingEnemies(combat: CombatState): readonly EnemyState[] {
  return combat.enemies.filter((enemy) => enemy.hp > 0);
}

/**
 * Run the pipeline and write the result down: spend the target's Block, take
 * it off HP, consume Focus, count the attack, log it, fire the hooks.
 *
 * Damage never happens without a log line. That line is the player's answer to
 * "why did I take 19 damage", and it is itemised because a number without its
 * derivation is exactly the thing that makes a game feel unfair.
 */
export function applyDamage(state: GameState, input: DamageInput, source: string): GameState {
  const breakdown = computeDamage(state, input);
  const targetName = combatantName(state, input.target);

  let next = withCombat(state, (combat) => {
    let updated = combat;

    if (input.target.kind === 'player') {
      updated = { ...updated, block: updated.block - breakdown.blocked };
    } else {
      const uid = input.target.uid;
      updated = {
        ...updated,
        enemies: updated.enemies.map((enemy) =>
          enemy.uid === uid
            ? { ...enemy, block: enemy.block - breakdown.blocked, hp: Math.max(0, enemy.hp - breakdown.toHull) }
            : enemy,
        ),
      };
    }

    if (input.attacker.kind === 'player' && input.isAttack) {
      updated = { ...updated, attacksThisTurn: updated.attacksThisTurn + 1 };
      if (breakdown.focusConsumed > 0) updated = { ...updated, focus: 0 };
    }

    return updated;
  });

  if (input.target.kind === 'player') {
    next = withRun(next, (run) => ({
      ...run,
      pilot: { ...run.pilot, health: Math.max(0, run.pilot.health - breakdown.toHull) },
    }));
  }

  next = appendLog(next, {
    source,
    kind: 'damage',
    text: `${targetName} ${takes(input.target)} ${breakdown.toHull}${breakdown.blocked > 0 ? ` (${breakdown.blocked} blocked)` : ''} — ${explainDamage(breakdown)}`,
    detail: {
      to: input.target.kind === 'player' ? 'player' : input.target.uid,
      toHull: breakdown.toHull,
      blocked: breakdown.blocked,
    },
  });

  next = fireHook(next, 'onDamageDealt', {
    targetUid: input.target.kind === 'player' ? 'player' : input.target.uid,
    amount: breakdown.toHull,
    source,
  });
  if (input.target.kind === 'player') {
    next = fireHook(next, 'onDamageTaken', { amount: breakdown.toHull, source });
  }

  return checkDeath(next, input.target, source);
}

/**
 * Damage with no attacker and no pipeline: overheat, and later environments
 * like the Debris Field rock. Vulnerable does not amplify a reactor cooking
 * you from the inside, and Block does not stop it.
 */
export function applyDirectDamage(
  state: GameState,
  target: Combatant,
  amount: number,
  source: string,
  reason: string,
): GameState {
  const dealt = Math.max(0, Math.floor(amount));
  if (dealt === 0) return state;

  let next =
    target.kind === 'player'
      ? withRun(state, (run) => ({
          ...run,
          pilot: { ...run.pilot, health: Math.max(0, run.pilot.health - dealt) },
        }))
      : withCombat(state, (combat) => ({
          ...combat,
          enemies: combat.enemies.map((enemy) =>
            enemy.uid === target.uid ? { ...enemy, hp: Math.max(0, enemy.hp - dealt) } : enemy,
          ),
        }));

  next = appendLog(next, {
    source,
    kind: 'damage',
    text: `${combatantName(state, target)} ${takes(target)} ${dealt} — ${reason}, unblockable`,
    detail: { toHull: dealt, direct: true },
  });

  if (target.kind === 'player') {
    next = fireHook(next, 'onDamageTaken', { amount: dealt, source });
  }

  return checkDeath(next, target, source);
}

export function healPlayer(state: GameState, amount: number, source: string): GameState {
  const run = state.run;
  if (run === null || amount <= 0) return state;
  const healed = Math.min(run.pilot.maxHealth, run.pilot.health + Math.floor(amount));
  if (healed === run.pilot.health) return state;
  return appendLog(
    withRun(state, (current) => ({ ...current, pilot: { ...current.pilot, hull: healed } })),
    { source, kind: 'combat', text: `Hull repaired to ${healed}.`, detail: { hull: healed } },
  );
}

/** The log is read by a person. "You takes 9" is not a sentence. */
function takes(who: Combatant): string {
  return who.kind === 'player' ? 'take' : 'takes';
}

/** The readable name of a combatant. Never a uid — the log is read by a person. */
export function combatantName(state: GameState, who: Combatant): string {
  if (who.kind === 'player') return 'You';
  const combat = state.run?.combat;
  const enemy = combat?.enemies.find((entry) => entry.uid === who.uid);
  if (enemy === undefined) return 'Unknown';
  return enemyTable.find(enemy.defId)?.name ?? enemy.defId;
}

function checkDeath(state: GameState, target: Combatant, source: string): GameState {
  if (target.kind === 'player') {
    if ((state.run?.pilot.health ?? 1) > 0) return state;
    const dead = withCombat(state, (combat) => ({ ...combat, outcome: 'lost' as const }));
    return fireHook(
      appendLog(dead, { source, kind: 'combat', text: 'You are cut down.', detail: null }),
      'onPlayerDeath',
      { source },
    );
  }

  const combat = state.run?.combat;
  const enemy = combat?.enemies.find((entry) => entry.uid === target.uid);
  if (enemy === undefined || enemy.hp > 0) return state;

  const name = enemyTable.find(enemy.defId)?.name ?? enemy.defId;
  const killed = fireHook(
    appendLog(state, { source, kind: 'combat', text: `${name} destroyed.`, detail: { enemy: enemy.defId } }),
    'onEnemyKilled',
    { enemyUid: enemy.uid, enemyId: enemy.defId },
  );

  const remaining = killed.run?.combat;
  if (remaining !== undefined && remaining !== null && livingEnemies(remaining).length === 0) {
    return withCombat(killed, (current) => ({ ...current, outcome: 'won' as const }));
  }
  return killed;
}

/** `6 base +4 IAI x1.5 Vulnerable = 15`, for the card tooltip and the log. */
export function explainDamage(breakdown: DamageBreakdown): string {
  const parts = breakdown.steps.map((step) => {
    if (step.kind === 'base') return `${step.amount} base`;
    if (step.kind === 'mult') return `x${step.factor ?? 1} ${step.label}`;
    if (step.kind === 'block') return `-${-step.delta} ${step.label}`;
    if (step.kind === 'floor') return null;
    return `${step.delta >= 0 ? '+' : ''}${step.delta} ${step.label}`;
  });
  return `${parts.filter((part) => part !== null).join(' ')} = ${breakdown.toHull}`;
}
