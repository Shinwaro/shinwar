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
import {
  enemies as enemyTable,
  environments as environmentTable,
  statuses as statusTable,
} from '../../content/registry.ts';
import { environmentRules, pilotRules, stanceRulesFor } from './rules.ts';

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
  /**
   * This hit comes from a card's stance rider rather than its base effects.
   *
   * The rider is the stance's own bonus. Letting the stance's *other* bonus —
   * IAI's flat +2 while hot — apply on top of it charged the same passive
   * twice for one card, and worse, the card face never said so: rider text is
   * generated from the raw ops, so "IAI: Deal 2 damage" was printed while 4
   * landed. A preview that can disagree with the result is the failure this
   * project calls a P1, and this was one.
   */
  readonly fromRider?: boolean;
  /**
   * The first damage instance this card has produced.
   *
   * Relic and implant flat damage rides on this and nothing else. Applied per
   * instance it multiplied itself against every multi-hit card in the deck:
   * +6 from two implants on a card that swings three times is +18, and by Act 3
   * with four sources of flat damage the boss fights were being decided by
   * arithmetic rather than by play. The bonus lands on the card's FIRST SWING,
   * the same scoping Focus already uses, so the flat sources make every card
   * better instead of making three cards unanswerable.
   *
   * A swing, though — not a damage instance. A card that hits every enemy once
   * is one arc through the room, and the whole room is in the way of it; paying
   * the bonus only to whichever enemy happened to resolve first made an AoE
   * strictly worse the more targets it had, which is backwards. Three hits at
   * ONE target is the thing that had to stop, and that is three swings.
   *
   * Strength is deliberately NOT on this. It is a status the player builds
   * inside a fight, it is visible on the board, and multi-hit paying it off is
   * the whole reason to build it — that interaction is a plan, not a leak.
   */
  readonly firstSwingOfCard?: boolean;
  /**
   * Which swing of the card this is, counting from zero.
   *
   * Logged, and read by the animation layer to decide what happens at the same
   * moment. One card that hits every enemy once is ONE event — the numbers
   * should appear together and the bars should drop together — while a card
   * that hits the same enemy three times is three, spaced out. Those two are
   * indistinguishable from the log alone, because both arrive as a run of
   * damage entries from the same card.
   */
  readonly swing?: number;
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
  field: 'damageDealtFlat' | 'damageDealtMult' | 'damageTakenMult' | 'damageTakenFlat',
): {
  readonly name: string;
  readonly value: number;
  readonly stacks: number;
  readonly floor: number | null;
}[] {
  const out: { name: string; value: number; stacks: number; floor: number | null }[] = [];
  for (const held of stacks) {
    const def = statusTable.find(held.status);
    const value = def?.[field];
    if (value === undefined) continue;
    out.push({
      name: def?.name ?? held.status,
      value,
      stacks: held.stacks,
      floor: def?.multFloor ?? null,
    });
  }
  return out;
}

/**
 * Stack a multiplicative status across its stacks, respecting its floor.
 *
 * **Flat steps, not compounding.** Two Weak used to be 0.75 x 0.75 = 0.5625 and
 * two Vulnerable 1.25 x 1.25 = 1.5625, which is the arithmetic nobody does in
 * their head. The status says "25% less damage per stack"; a player reading
 * that expects two stacks to be half, and the damage breakdown then printed
 * `x0.5625` next to a card that promised a quarter off twice. Generated rules
 * text is only worth having if the number underneath it is the number the text
 * describes.
 *
 * So a stack is worth `value - 1` and they add: 1 + (value - 1) x stacks. Weak
 * goes 0.75 / 0.5, Vulnerable 1.25 / 1.5, and both land exactly on their own
 * caps at two — which is the other reason this reads better than compounding
 * did. The cap used to be an arbitrary-looking clamp that bit somewhere between
 * the second and third stack; now the second stack IS the cap.
 *
 * Both directions of clamp, because a status can multiply up or down: a floor
 * on a reducing status is a minimum, and on an amplifying one it is a maximum.
 * The `Math.max(0, ...)` is for an uncapped reducing status, where enough
 * stacks would otherwise cross zero and start healing the target.
 */
function stackedFactor(value: number, stacks: number, floor: number | null): number {
  const raw = 1 + (value - 1) * stacks;
  if (floor === null) return value < 1 ? Math.max(0, raw) : raw;
  return value < 1 ? Math.max(floor, raw) : Math.min(floor, raw);
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

  /* 2 — Focus. One stack, on the first instance of an attack, in a stance that
     turns Focus into damage.

     One rather than the whole stack: Focus used to do nothing until the single
     moment it did everything, which made it a number you watched rather than a
     resource you spent. A stack a card means every card is a small decision and
     the stance change redirects the stream instead of cashing it. */
  const live = playerAttacking ? stanceRulesFor(state, combat.stance) : null;
  if (
    playerAttacking &&
    input.isAttack &&
    input.consumesFocus &&
    combat.focus > 0 &&
    live?.focusMode === 'damage'
  ) {
    ctx = { ...record(ctx, 'Focus', 'add', ctx.amount + live.focusPerStack), focusConsumed: 1 };
  }

  /* 3 — flat additives: Strength-likes, then the stance passive. */
  for (const status of namedStatuses(attackerStatuses, 'damageDealtFlat')) {
    const delta = status.value * status.stacks;
    if (delta === 0) continue;
    ctx = record(ctx, `${status.name} ${status.stacks}`, 'add', ctx.amount + delta);
  }

  if (playerAttacking && input.isAttack && live !== null) {
    // Through the live table, not the raw one: a Stance Mastery is a diff
    // against `STANCES` and must reach the pipeline without a special case.
    const stance = live;
    if (stance.firstAttackBonus > 0 && input.attackOrdinal === 0) {
      ctx = record(ctx, `${stance.name} first attack`, 'add', ctx.amount + stance.firstAttackBonus);
    }
    if (stance.attackPenalty > 0) {
      ctx = record(ctx, stance.name, 'add', ctx.amount - stance.attackPenalty);
    }
    /*
     * IAI's own passive: hot attacks hit harder.
     *
     * The stance charged 2 Heat a turn and gave nothing for standing in the
     * heat it created, so riding the gauge was pure cost. This is the reward
     * half, and it is declared here rather than hooked because it modifies a
     * number the pipeline is in the middle of producing.
     */
    /* Every hit, including the rider's.
     *
       It was gated on `input.fromRider !== true`, on the reasoning that a
       stance rider IS the stance's bonus and should not also collect the
       stance's damage bonus. Tidy, and wrong in play: IAI Slash showed +2 on
       its own hit and nothing on its IAI rider hit, so the one stance whose
       whole identity is "hot swings hit harder" visibly failed to apply that to
       half of its own signature card. The bonus is a property of the swing,
       not of which clause asked for it. */
    if (stance.hotDamageAtHeat !== undefined && combat.heat >= stance.hotDamageAtHeat) {
      ctx = record(ctx, `${stance.name} hot`, 'add', ctx.amount + (stance.hotDamage ?? 0));
    }

    /* Relics and implants, in two flavours, both flat and both before anything
       multiplies.

       `damageFlat` lands only on the card's FIRST swing — see
       `DamageInput.firstSwingOfCard`. Every target of that swing gets it; later
       swings of the same card get none, which is what stops a three-hit card
       tripling it.

       `damageEveryHit` lands on all of them, which is precisely why the numbers
       on it are smaller. The two are different build questions — heavy single
       swings against many small ones — and the totals panel names them
       separately for the same reason. */
    const carried = pilotRules(state);
    if (carried.damageFlat !== 0 && input.firstSwingOfCard !== false) {
      ctx = record(ctx, 'Relics', 'add', ctx.amount + carried.damageFlat);
    }
    if (carried.damageEveryHit !== 0) {
      ctx = record(ctx, 'Relics, every hit', 'add', ctx.amount + carried.damageEveryHit);
    }
  }

  /* 4 — multiplicatives: what the attacker suffers, then what the target invites. */
  for (const status of namedStatuses(attackerStatuses, 'damageDealtMult')) {
    const factor = stackedFactor(status.value, status.stacks, status.floor);
    ctx = record(ctx, status.name, 'mult', ctx.amount * factor, factor);
  }
  for (const status of namedStatuses(targetStatuses, 'damageTakenMult')) {
    const factor = stackedFactor(status.value, status.stacks, status.floor);
    ctx = record(ctx, status.name, 'mult', ctx.amount * factor, factor);
  }

  /* 4b — the environment. Gravity Well adds to anything heavy, which is a rule
     about the number the pipeline is producing rather than an event a hook
     could respond to. Attacks only: a rock does not fall harder.

     Flat, not a multiplier. A multiplier scaled with the player's own build, so
     the environment meant to reward one heavy swing instead rewarded whoever
     already had the heaviest swing — worth twice as much to the deck that
     needed it least. */
  if (input.isAttack) {
    const rules = environmentRules(state);
    const threshold = rules.bigHitThreshold;
    const bonus = rules.bigHitBonus;
    if (threshold !== undefined && bonus !== undefined && ctx.amount >= threshold) {
      ctx = record(ctx, environmentName(state), 'add', ctx.amount + bonus);
    }
  }

  /* 5 — target-side reductions. Act 3's counter-enemies live here: reading the
     player's build means reading the number about to land on them, and so does
     the plating the player is wearing. */
  if (input.isAttack && input.target.kind === 'player') {
    const soak = pilotRules(state).damageTakenFlat;
    if (soak !== 0) ctx = record(ctx, 'Relics', 'reduce', Math.max(0, ctx.amount - soak));
  }
  /* Plating the target is WEARING, as opposed to bolted to the ship. Tempered
     is the only one today. Same step as the relic soak and for the same reason:
     it is the last thing between a number and a hull, and anything that
     multiplies has already had its say. */
  for (const status of namedStatuses(targetStatuses, 'damageTakenFlat')) {
    const soak = status.value * status.stacks;
    if (soak === 0) continue;
    ctx = record(ctx, `${status.name} ${status.stacks}`, 'reduce', Math.max(0, ctx.amount - soak));
  }
  const struck = input.target;
  if (input.isAttack && struck.kind === 'enemy') {
    const defId = combat.enemies.find((enemy) => enemy.uid === struck.uid)?.defId;
    const rule = defId === undefined ? undefined : enemyTable.find(defId)?.damageRules;
    if (rule !== undefined && ctx.amount > rule.overAmount) {
      ctx = record(ctx, rule.label, 'reduce', ctx.amount * rule.multiplier, rule.multiplier);
    }
  }

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
  // Hitting something already dead does nothing and logs nothing. Without this
  // a multi-hit card narrates three swings at a corpse.
  const aimedAt = input.target;
  if (aimedAt.kind === 'enemy') {
    const target = state.run?.combat?.enemies.find((enemy) => enemy.uid === aimedAt.uid);
    if (target === undefined || target.hp <= 0) return state;
  }

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
      if (breakdown.focusConsumed > 0) {
        updated = { ...updated, focus: Math.max(0, updated.focus - breakdown.focusConsumed) };
      }
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
      swing: input.swing ?? 0,
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
 * Damage with no attacker and no pipeline: overheat, status ticks, the Debris
 * Field rock. Vulnerable does not amplify a reactor cooking you from the
 * inside, and Strength has nobody to belong to.
 *
 * `blockable` is the one thing that varies, and it is the difference between a
 * hazard and a punishment. Overheat and burn come from inside the ship, so a
 * shield in front of it is beside the point. A rock is a physical object
 * arriving from outside, telegraphed a full turn ahead — and a telegraphed hit
 * you are told about and cannot answer is not a decision, it is a bill. Block
 * answers it.
 *
 * The Block arithmetic lives here rather than at the call site so there is one
 * place where "absorb, then what is left reaches hull" is written down.
 */
export function applyDirectDamage(
  state: GameState,
  target: Combatant,
  amount: number,
  source: string,
  reason: string,
  options: { readonly blockable?: boolean } = {},
): GameState {
  const dealt = Math.max(0, Math.floor(amount));
  if (dealt === 0) return state;

  const combat = state.run?.combat;
  const available = options.blockable === true && combat != null ? blockOf(combat, target) : 0;
  const blocked = Math.min(available, dealt);
  const toHull = dealt - blocked;

  let next =
    target.kind === 'player'
      ? withRun(state, (run) => ({
          ...run,
          pilot: { ...run.pilot, health: Math.max(0, run.pilot.health - toHull) },
        }))
      : withCombat(state, (current) => ({
          ...current,
          enemies: current.enemies.map((enemy) =>
            enemy.uid === target.uid ? { ...enemy, hp: Math.max(0, enemy.hp - toHull) } : enemy,
          ),
        }));

  if (blocked > 0) {
    next =
      target.kind === 'player'
        ? withCombat(next, (current) => ({ ...current, block: current.block - blocked }))
        : withCombat(next, (current) => ({
            ...current,
            enemies: current.enemies.map((enemy) =>
              enemy.uid === target.uid ? { ...enemy, block: enemy.block - blocked } : enemy,
            ),
          }));
  }

  next = appendLog(next, {
    source,
    kind: 'damage',
    text:
      blocked > 0
        ? `${combatantName(state, target)} ${takes(target)} ${toHull} — ${reason}, ${blocked} blocked`
        : `${combatantName(state, target)} ${takes(target)} ${toHull} — ${reason}${options.blockable === true ? '' : ', unblockable'}`,
    // `to` matches the field on pipeline damage so anything reading the log as
    // an event stream — the animation layer, the simulator — sees one shape.
    detail: {
      to: target.kind === 'player' ? 'player' : target.uid,
      toHull,
      blocked,
      direct: true,
    },
  });

  if (target.kind === 'player' && toHull > 0) {
    next = fireHook(next, 'onDamageTaken', { amount: toHull, source });
  }

  return checkDeath(next, target, source);
}

export function healPlayer(state: GameState, amount: number, source: string): GameState {
  const run = state.run;
  if (run === null || amount <= 0) return state;
  const healed = Math.min(run.pilot.maxHealth, run.pilot.health + Math.floor(amount));
  if (healed === run.pilot.health) return state;
  return appendLog(
    withRun(state, (current) => ({ ...current, pilot: { ...current.pilot, health: healed } })),
    { source, kind: 'combat', text: `Patched up to ${healed}.`, detail: { health: healed } },
  );
}

/** The environment's name, for a pipeline step's label. Never a raw id. */
function environmentName(state: GameState): string {
  const id = state.run?.combat?.environmentId ?? '';
  return environmentTable.find(id)?.name ?? id;
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
  let killed = fireHook(
    appendLog(state, { source, kind: 'combat', text: `${name} destroyed.`, detail: { enemy: enemy.defId } }),
    'onEnemyKilled',
    { enemyUid: enemy.uid, enemyId: enemy.defId },
  );

  /* Mending off the kill, from what you are carrying. After the hook rather
     than before it, so a relic that responds to a death and an implant that
     pays for one resolve in the order the carrying rail lists them.

     `healPlayer` caps at maximum on its own and does nothing at zero, so this
     costs nothing for the runs carrying none of it. */
  const perKill = pilotRules(killed).healPerKill;
  if (perKill > 0) killed = healPlayer(killed, perKill, 'implants');

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
    // A reduction may be either flat or a factor; say which it was.
    if (step.kind === 'reduce') {
      return step.factor === null ? `${step.delta} ${step.label}` : `x${step.factor} ${step.label}`;
    }
    if (step.kind === 'block') return `-${-step.delta} ${step.label}`;
    if (step.kind === 'floor') return null;
    return `${step.delta >= 0 ? '+' : ''}${step.delta} ${step.label}`;
  });
  return `${parts.filter((part) => part !== null).join(' ')} = ${breakdown.toHull}`;
}
