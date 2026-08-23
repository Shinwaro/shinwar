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
import { liveStance } from './rules.ts';
import { setStance, cycleStance } from './stance.ts';
import { draw, moveToExhaust, narrateDraw, randomFromHand } from './piles.ts';
import { mintCard } from './instances.ts';
import { FOCUS_MAX } from '../../content/balance.ts';

export interface EffectContext {
  /**
   * Whether this card has already spent a stack of Focus on Block.
   *
   * One stack per card, so a card granting Block twice does not quietly spend
   * two. The damage side is guarded the same way by `consumesFocus`, which is
   * already true only for the first instance of the first attack.
   */
  readonly focusSpent: boolean;
  /** A card id, an enemy uid, a module id — whatever is answerable in the log. */
  readonly source: string;
  readonly actor: Combatant;
  /** The target the player picked, if the card asked for one. */
  readonly chosen: Combatant | null;
  /** Set by `exhaustSelf`. Read by the card resolver after the ops run. */
  readonly exhaustSelf: boolean;
  /**
   * Enemies this card has killed so far in its own resolution.
   *
   * Scoped to the card rather than the turn, so an execution rider pays once
   * for what this card did and not for what the last one did.
   */
  readonly killsThisPlay: number;
  /**
   * Cards this card has discarded so far in its own resolution.
   *
   * Scoped to the play for the same reason as the kills above: "for each card
   * discarded" is a promise about what this card threw away.
   */
  readonly discardedThisPlay: number;
  /**
   * Damage instances this card has produced so far.
   *
   * Read by the damage op so relic and implant flat damage lands on the first
   * swing only — see `DamageInput.firstHitOfCard`.
   */
  readonly hitsThisPlay: number;
  /**
   * Swings this card has thrown so far, counting across its ops.
   *
   * The animation layer groups by this: everything on one swing lands on one
   * beat. It has to keep counting between ops rather than restarting, or a
   * card's base damage and its stance rider both report swing 0 and go off
   * together — which is what made IAI Slash's 6 and its rider's 2 read as a
   * single hit.
   */
  readonly swingsThisPlay: number;
  /**
   * This card has applied a status that a vent would shed.
   *
   * Read by the vent op so one card cannot give you Scald and take it back in
   * the same breath. Across a TURN that trade is fine and deliberate — the vent
   * is a counterplay you paid a card for — but a single card doing both is not
   * a decision, it is a card with two halves that cancel.
   */
  readonly appliedShedStatus: boolean;
  /**
   * These ops are a card's stance rider rather than its base effects.
   *
   * Read by the damage op so the stance's flat hot bonus is not charged on top
   * of the stance's own rider — see `DamageInput.fromRider`.
   */
  readonly fromRider: boolean;
}

export function createContext(source: string, actor: Combatant, chosen: Combatant | null): EffectContext {
  return {
    source,
    actor,
    chosen,
    exhaustSelf: false,
    focusSpent: false,
    killsThisPlay: 0,
    discardedThisPlay: 0,
    hitsThisPlay: 0,
    swingsThisPlay: 0,
    appliedShedStatus: false,
    fromRider: false,
  };
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
    case 'killedThisPlay':
      return context.killsThisPlay > 0;
    default: {
      const unreachable: never = when;
      return unreachable;
    }
  }
}

export function scaleValue(state: GameState, source: ScaleSource, context: EffectContext): number {
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
    case 'discardedThisPlay':
      return context.discardedThisPlay;
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
    /*
     * Stop when the player is dead, not when the fight is merely over.
     *
     * This used to break on anything other than `ongoing`, which meant the
     * killing blow on the LAST enemy skipped every op after it — so an
     * execution rider paid out on every kill except the one that ended the
     * fight. A card that says "if this kills an enemy, gain 40 Alloy" and then
     * does not, on the kill you most wanted it to, is the game lying about its
     * own rules.
     *
     * Safe because the ops that could misbehave already refuse to: `applyDamage`
     * will not hit a corpse, and `allEnemies` resolves to nothing once the
     * board is clear. What is left is the card paying what it promised.
     */
    if (current.state.run?.combat?.outcome === 'lost') break;
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
      /* Swings outer, targets inner.
      
         A card that hits everything twice is two swings at the board, not two
         separate executions — and resolving it target-first meant the first
         enemy took both blows before the second took any, which is a different
         fight when the first one dies in between. It also made the two
         indistinguishable in the log, so the animation layer could not tell an
         AoE from a multi-hit. */
      for (let hit = 0; hit < times; hit++) {
        for (const target of resolved.targets) {
          if (next.run?.combat?.outcome !== 'ongoing') break;
          const combat = requireCombat(next);
          // Read before the blow so a kill is "was alive, now is not" rather
          // than "is dead", which would also count hitting a corpse.
          const wasAlive =
            target.kind === 'player'
              ? true
              : (combat.enemies.find((enemy) => enemy.uid === target.uid)?.hp ?? 0) > 0;
          const spendsHere =
            !context.focusSpent && cardTable.find(context.source)?.keepsFocus !== true;
          next = applyDamage(
            next,
            {
              amount: op.amount,
              attacker: context.actor,
              target,
              isAttack: true,
              fromRider: context.fromRider,
              // Relic and implant flat damage is per card, not per swing.
              firstHitOfCard: context.hitsThisPlay === 0,
              // Everything on the same swing lands on the same beat, and the
              // count carries across a card's ops so its rider is its own.
              swing: context.swingsThisPlay + hit,
              attackOrdinal: combat.attacksThisTurn,
              /*
               * One stack per CARD, not per turn.
               *
               * This used to read `attacksThisTurn === 0`, which was right when
               * a single attack cashed the whole bank — but under one-stack-at-
               * a-time it meant only the turn's first attack ever spent Focus
               * and every card after it swung bare. `context.focusSpent` is the
               * same guard the Block side uses, so both halves of the mechanic
               * spend at exactly the same rate.
               */
              consumesFocus:
                !context.focusSpent &&
                cardTable.find(context.source)?.keepsFocus !== true,
            },
            context.source,
          );
          context = { ...context, hitsThisPlay: context.hitsThisPlay + 1 };

          if (spendsHere && (next.run?.combat?.focus ?? 0) < combat.focus) {
            context = { ...context, focusSpent: true };
          }

          if (wasAlive && target.kind === 'enemy') {
            const after = next.run?.combat?.enemies.find((enemy) => enemy.uid === target.uid);
            if (after !== undefined && after.hp <= 0) {
              context = { ...context, killsThisPlay: context.killsThisPlay + 1 };
            }
          }
        }
      }
      /* The swing count carries on past this op, so the next one — a stance
         rider, a second damage line — starts its own beats rather than
         reporting swing 0 again and landing on top of these. */
      context = { ...context, swingsThisPlay: context.swingsThisPlay + times };
      return { state: next, context };
    }

    case 'block': {
      // Block goes to whoever played the card. An enemy's Plate is the same op
      // as your Solar Shield, which is the point of making targets relative.
      if (op.amount <= 0) return keep(state);
      const actor = context.actor;

      /*
       * Focus, GUARD's half of it: one stack becomes Block on the first Block
       * this card grants. The mirror of what a stack does to an attack in IAI,
       * and the reason the stance change is a redirection rather than a
       * cash-out — the same stack is worth something in either stance, just a
       * different something.
       */
      const combatNow = state.run?.combat;
      const stanceNow = combatNow === undefined || combatNow === null ? null : liveStance(state);
      const focusBlock =
        actor.kind === 'player' &&
        !context.focusSpent &&
        combatNow !== undefined &&
        combatNow !== null &&
        combatNow.focus > 0 &&
        stanceNow?.focusMode === 'block' &&
        cardTable.find(context.source)?.keepsFocus !== true
          ? (stanceNow?.focusPerStack ?? 0)
          : 0;

      const amount = op.amount + focusBlock;
      const next = withCombat(state, (combat) =>
        actor.kind === 'player'
          ? {
              ...combat,
              block: combat.block + amount,
              blockGainedThisTurn: combat.blockGainedThisTurn + amount,
              focus: focusBlock > 0 ? Math.max(0, combat.focus - 1) : combat.focus,
            }
          : {
              ...combat,
              enemies: combat.enemies.map((enemy) =>
                enemy.uid === actor.uid ? { ...enemy, block: enemy.block + amount } : enemy,
              ),
            },
      );
      if (focusBlock > 0) context = { ...context, focusSpent: true };
      const logged = appendLog(next, {
        source: context.source,
        kind: 'block',
        text:
          actor.kind === 'player'
            ? `Block +${amount}${focusBlock > 0 ? ` (Focus +${focusBlock})` : ''} (${requireCombat(next).block}).`
            : `Block +${amount}.`,
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
      /* Remember whether this card has handed out something a vent would shed,
         so a vent later in the same card does not take it straight back. */
      const shedable = op.stacks > 0 && statusTable.find(op.status)?.shedOnVent !== undefined;
      return {
        state: next,
        context: shedable ? { ...context, appliedShedStatus: true } : context,
      };
    }

    case 'gainHeat':
      return keep(gainHeat(state, op.amount, context.source));

    case 'ventHeat':
      /* A card cannot give you Scald and take it back in the same breath. Over
         a turn that trade is fine and deliberate; inside one card it is two
         halves that cancel, which is not a decision. */
      return keep(
        ventHeat(state, op.amount, context.source, { shed: !context.appliedShedStatus }),
      );

    case 'gainFocus': {
      if (op.amount === 0) return keep(state);
      // Capped: Focus is banked in GUARD now, so without a ceiling the correct
      // play would always be "sit in GUARD until the stack is enormous", and
      // patience would stop being a decision.
      const next = withCombat(state, (combat) => ({
        ...combat,
        focus: Math.max(0, Math.min(FOCUS_MAX, combat.focus + op.amount)),
      }));
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
      /* Throwing the whole hand needs no roll: there is nothing to choose
         between when the answer is "all of them", and spending a number from
         the combat stream for a non-choice would shift every later roll in the
         fight for no reason. */
      const rolled = op.all === true
        ? { picked: run.combat.hand, rng: run.rng }
        : op.random === true
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
      return {
        state: appendLog(next, {
          source: context.source,
          kind: 'card',
          text: `Discarded ${rolled.picked.length}.`,
          detail: null,
        }),
        // What the ops after this one scale against.
        context: { ...context, discardedThisPlay: context.discardedThisPlay + rolled.picked.length },
      };
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

    case 'gainAlloy': {
      if (op.amount === 0) return keep(state);
      const paid = withRun(state, (current) => ({
        ...current,
        alloy: Math.max(0, current.alloy + op.amount),
      }));
      return keep(
        appendLog(paid, {
          source: context.source,
          kind: 'run',
          text: `Alloy ${op.amount > 0 ? '+' : ''}${op.amount}.`,
          detail: { alloy: op.amount },
        }),
      );
    }

    case 'conditional': {
      const branch = testCondition(state, context, op.when) ? op.then : op.else;
      if (branch === undefined) return keep(state);
      return applyEffects(state, branch, context);
    }

    case 'scaleWith': {
      const times = Math.floor(scaleValue(state, op.source, context) / Math.max(1, op.per));
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
