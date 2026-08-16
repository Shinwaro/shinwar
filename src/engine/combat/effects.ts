/* The effect-op interpreter.
 *
 * Cards contain data, never code. This file is the only thing that knows what
 * an op means, which is what makes "adding a card is one file edit" true.
 *
 * Targets are relative to whoever is acting. From the player, `enemy` means an
 * enemy; from an enemy, `enemy` means you. One rule, no special cases, and
 * enemy moves get to reuse the whole vocabulary for free.
 *
 * Ask before adding an op. Check whether `conditional` and `scaleWith` already
 * express it — every op is permanent complexity.
 */

import type { Condition, EffectOp, GameState, ScaleSource, Target } from '../types.ts';
import { appendLog, requireCombat, requireRun, withCombat, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { pick } from '../rng.ts';
import { cards as cardTable, statuses as statusTable } from '../../content/registry.ts';
import type { Combatant } from './damage.ts';
import {
  PLAYER,
  applyDamage,
  combatantName,
  enemyTarget,
  healPlayer,
  livingEnemies,
} from './damage.ts';
import { gainHeat, ventHeat } from './heat.ts';
import { addStacks, stacksOf } from './keywords.ts';
import { setStance, cycleStance } from './stance.ts';
import { draw, moveToExhaust, narrateDraw, randomFromHand } from './piles.ts';
import { mintCard } from './instances.ts';

export interface EffectContext {
  /** A card id, an enemy uid, a module id — whatever is answerable in the log. */
  readonly source: string;
  readonly actor: Combatant;
  /** The target the player picked, if the card asked for one. */
  readonly chosen: Combatant | null;
  /** Set by `exhaustSelf`. Read by the card resolver after the ops run. */
  readonly exhaustSelf: boolean;
}

export function createContext(source: string, actor: Combatant, chosen: Combatant | null): EffectContext {
  return { source, actor, chosen, exhaustSelf: false };
}

export interface EffectResult {
  readonly state: GameState;
  readonly context: EffectContext;
}

/* ---------- targeting ---------- */

function opponentsOf(state: GameState, actor: Combatant): readonly Combatant[] {
  if (actor.kind === 'player') {
    return livingEnemies(requireCombat(state)).map((enemy) => enemyTarget(enemy.uid));
  }
  return [PLAYER];
}

function resolveTargets(
  state: GameState,
  context: EffectContext,
  target: Target,
): { readonly targets: readonly Combatant[]; readonly state: GameState } {
  const opponents = opponentsOf(state, context.actor);

  switch (target) {
    case 'self':
      return { targets: [context.actor], state };

    case 'allEnemies':
      return { targets: opponents, state };

    case 'randomEnemy': {
      if (opponents.length === 0) return { targets: [], state };
      const run = requireRun(state);
      const rolled = pick(run.rng, 'combat', opponents);
      return { targets: [rolled.value], state: withRun(state, (current) => ({ ...current, rng: rolled.rng })) };
    }

    case 'enemy':
    case 'chosenEnemy': {
      /*
       * The target the player picked, and only that one.
       *
       * If it died partway through the card, the rest of the card is spent on
       * the corpse rather than sliding onto the next enemy. Overkill has to
       * stay wasted: a rider that quietly re-aims turns "I killed it with
       * room to spare" into free damage the player never chose to place, and
       * makes the preview a lie about where the damage lands.
       */
      const chosen = context.chosen;
      if (chosen !== null) {
        const stillListed = requireCombat(state).enemies.some(
          (enemy) => chosen.kind === 'enemy' && enemy.uid === chosen.uid,
        );
        if (stillListed) return { targets: [chosen], state };
      }
      // No pick at all — an enemy move, or a card played without a target.
      const first = opponents[0];
      return { targets: first === undefined ? [] : [first], state };
    }

    default: {
      const unreachable: never = target;
      return unreachable;
    }
  }
}

/* ---------- conditions and scaling ---------- */

export function testCondition(state: GameState, context: EffectContext, when: Condition): boolean {
  const combat = requireCombat(state);
  const run = requireRun(state);

  switch (when.kind) {
    case 'stanceIs':
      return combat.stance === when.stance;
    case 'heatAtLeast':
      return combat.heat >= when.value;
    case 'heatAtMost':
      return combat.heat <= when.value;
    case 'targetHasStatus': {
      const { targets } = resolveTargets(state, context, 'enemy');
      const target = targets[0];
      if (target === undefined) return false;
      const held =
        target.kind === 'player'
          ? combat.statuses
          : (combat.enemies.find((enemy) => enemy.uid === target.uid)?.statuses ?? []);
      return stacksOf(held, when.status) > 0;
    }
    case 'handSizeAtLeast':
      return combat.hand.length >= when.value;
    case 'cardsPlayedThisTurnAtLeast':
      return combat.cardsPlayedThisTurn >= when.value;
    case 'hullBelowPct':
      return run.pilot.health / Math.max(1, run.pilot.maxHealth) < when.value / 100;
    default: {
      const unreachable: never = when;
      return unreachable;
    }
  }
}

export function scaleValue(state: GameState, source: ScaleSource): number {
  const combat = requireCombat(state);
  switch (source) {
    case 'currentHeat':
      return combat.heat;
    case 'focus':
      return combat.focus;
    case 'blockGainedThisTurn':
      return combat.blockGainedThisTurn;
    case 'cardsPlayedThisTurn':
      return combat.cardsPlayedThisTurn;
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

/* ---------- the interpreter ---------- */

export function applyEffects(
  state: GameState,
  effects: readonly EffectOp[],
  context: EffectContext,
): EffectResult {
  let current: EffectResult = { state, context };
  for (const op of effects) {
    if (current.state.run?.combat?.outcome !== 'ongoing') break;
    current = applyOp(current.state, op, current.context);
  }
  return current;
}

function applyOp(state: GameState, op: EffectOp, context: EffectContext): EffectResult {
  const keep = (next: GameState): EffectResult => ({ state: next, context });

  switch (op.op) {
    case 'damage': {
      const resolved = resolveTargets(state, context, op.target);
      let next = resolved.state;
      const times = Math.max(1, op.times ?? 1);
      for (const target of resolved.targets) {
        for (let hit = 0; hit < times; hit++) {
          if (next.run?.combat?.outcome !== 'ongoing') break;
          const combat = requireCombat(next);
          next = applyDamage(
            next,
            {
              amount: op.amount,
              attacker: context.actor,
              target,
              isAttack: true,
              attackOrdinal: combat.attacksThisTurn,
              // Only the first instance spends the Focus stack.
              consumesFocus: hit === 0 && combat.attacksThisTurn === 0,
            },
            context.source,
          );
        }
      }
      return keep(next);
    }

    case 'block': {
      // Block goes to whoever played the card. An enemy's Plate is the same op
      // as your Solar Parry, which is the point of making targets relative.
      if (op.amount <= 0) return keep(state);
      const actor = context.actor;
      const next = withCombat(state, (combat) =>
        actor.kind === 'player'
          ? {
              ...combat,
              block: combat.block + op.amount,
              blockGainedThisTurn: combat.blockGainedThisTurn + op.amount,
            }
          : {
              ...combat,
              enemies: combat.enemies.map((enemy) =>
                enemy.uid === actor.uid ? { ...enemy, block: enemy.block + op.amount } : enemy,
              ),
            },
      );
      const logged = appendLog(next, {
        source: context.source,
        kind: 'block',
        text:
          actor.kind === 'player'
            ? `Block +${op.amount} (${requireCombat(next).block}).`
            : `Block +${op.amount}.`,
        detail: {
          to: actor.kind === 'player' ? 'player' : actor.uid,
          amount: op.amount,
        },
      });
      return keep(actor.kind === 'player' ? fireHook(logged, 'onBlockGained', { amount: op.amount }) : logged);
    }

    case 'applyStatus': {
      const resolved = resolveTargets(state, context, op.target);
      let next = resolved.state;
      for (const target of resolved.targets) {
        next = withCombat(next, (combat) =>
          target.kind === 'player'
            ? { ...combat, statuses: addStacks(combat.statuses, op.status, op.stacks) }
            : {
                ...combat,
                enemies: combat.enemies.map((enemy) =>
                  enemy.uid === target.uid
                    ? { ...enemy, statuses: addStacks(enemy.statuses, op.status, op.stacks) }
                    : enemy,
                ),
              },
        );
        next = appendLog(next, {
          source: context.source,
          kind: 'status',
          text: `${statusTable.find(op.status)?.name ?? op.status} ${op.stacks >= 0 ? '+' : ''}${op.stacks} on ${
            target.kind === 'player' ? 'you' : combatantName(next, target)
          }.`,
          detail: { status: op.status, stacks: op.stacks },
        });
      }
      return keep(next);
    }

    case 'gainHeat':
      return keep(gainHeat(state, op.amount, context.source));

    case 'ventHeat':
      return keep(ventHeat(state, op.amount, context.source));

    case 'gainFocus': {
      if (op.amount === 0) return keep(state);
      const next = withCombat(state, (combat) => ({ ...combat, focus: Math.max(0, combat.focus + op.amount) }));
      return keep(
        appendLog(next, {
          source: context.source,
          kind: 'combat',
          text: `Focus +${op.amount} (${requireCombat(next).focus}).`,
          detail: { focus: requireCombat(next).focus },
        }),
      );
    }

    case 'setStance':
      return keep(setStance(state, op.stance, context.source));

    case 'cycleStance':
      return keep(cycleStance(state, op.direction, context.source));

    case 'draw': {
      if (op.amount <= 0) return keep(state);
      const run = requireRun(state);
      if (run.combat === null) return keep(state);
      const result = draw(run.combat, run.rng, op.amount);
      const next = withRun(state, (current) => ({ ...current, rng: result.rng, combat: result.combat }));
      // Named, not counted: the player spent a card on this draw.
      return keep(narrateDraw(next, result, context.source, true));
    }

    case 'discard': {
      const run = requireRun(state);
      if (run.combat === null || run.combat.hand.length === 0) return keep(state);
      const rolled = op.random === true
        ? randomFromHand(run.combat, run.rng, op.amount)
        : { picked: run.combat.hand.slice(0, op.amount), rng: run.rng };
      let next = withRun(state, (current) => ({ ...current, rng: rolled.rng }));
      for (const card of rolled.picked) {
        next = withCombat(next, (combat) => ({
          ...combat,
          hand: combat.hand.filter((entry) => entry.uid !== card.uid),
          discard: [...combat.discard, card],
        }));
      }
      return keep(
        appendLog(next, {
          source: context.source,
          kind: 'card',
          text: `Discarded ${rolled.picked.length}.`,
          detail: null,
        }),
      );
    }

    case 'gainEnergy': {
      const next = withCombat(state, (combat) => ({ ...combat, energy: combat.energy + op.amount }));
      return keep(
        appendLog(next, {
          source: context.source,
          kind: 'combat',
          text: `Energy +${op.amount}.`,
          detail: null,
        }),
      );
    }

    case 'exhaustSelf':
      return { state, context: { ...context, exhaustSelf: true } };

    case 'addCardToHand': {
      const def = cardTable.find(op.cardId);
      if (def === undefined) return keep(state);
      const run = requireRun(state);
      const minted = mintCard(run.uidCounter, op.cardId, op.upgraded ?? false);
      const next = withRun(state, (current) => ({
        ...current,
        uidCounter: minted.uidCounter,
        combat:
          current.combat === null
            ? null
            : { ...current.combat, hand: [...current.combat.hand, minted.value] },
      }));
      return keep(
        appendLog(next, {
          source: context.source,
          kind: 'card',
          text: `${def.name} added to hand.`,
          detail: { card: op.cardId },
        }),
      );
    }

    case 'heal':
      return keep(healPlayer(state, op.amount, context.source));

    case 'conditional': {
      const branch = testCondition(state, context, op.when) ? op.then : op.else;
      if (branch === undefined) return keep(state);
      return applyEffects(state, branch, context);
    }

    case 'scaleWith': {
      const times = Math.floor(scaleValue(state, op.source) / Math.max(1, op.per));
      let current: EffectResult = { state, context };
      for (let i = 0; i < times; i++) {
        if (current.state.run?.combat?.outcome !== 'ongoing') break;
        current = applyEffects(current.state, op.then, current.context);
      }
      return current;
    }

    default: {
      const unreachable: never = op;
      return unreachable;
    }
  }
}

/** Exhaust a card that asked to exhaust itself, or discard it. */
export function retireCard(
  state: GameState,
  card: { readonly uid: string; readonly defId: string },
  exhaust: boolean,
): GameState {
  if (!exhaust) return state;
  const combat = requireCombat(state);
  const instance = [...combat.hand, ...combat.discard].find((entry) => entry.uid === card.uid);
  if (instance === undefined) return state;
  return fireHook(withCombat(state, (current) => moveToExhaust(current, instance)), 'onCardExhausted', {
    cardUid: card.uid,
    cardId: card.defId,
  });
}
