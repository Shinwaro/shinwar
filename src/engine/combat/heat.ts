/* Heat — the pressure valve.
 *
 * Per-combat, 0-10, starts at 0. It does not decay. You must vent.
 *
 * This is "solutions never fully solve problems" made systemic: your best
 * cards actively build toward your death, which manufactures the arc safe ->
 * strong -> greedy -> threatened -> desperate inside a single fight.
 *
 * The emphasis is on CARDS. A stance that cooks you on a timer produces the
 * same number without the decision, and the player correctly reads that as the
 * game taking a turn off them. The gauge should climb because of what you
 * chose to play, so IAI charges a modest 2 a turn and the swings are what
 * actually cook you.
 *
 * It is also fully visible and fully deterministic. The player always knows
 * exactly how hot they are and exactly what happens at 8 — Darkest Dungeon's
 * lesson was that hiding the number added confusion, not tension. Every
 * surface that shows Heat shows the threshold and the consequence with it.
 */

import type { GameState } from '../types.ts';
import { appendLog, requireCombat, requireRun, withCombat, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { HEAT } from '../../content/balance.ts';
import { cards as cardTable } from '../../content/registry.ts';
import { PLAYER, applyDirectDamage } from './damage.ts';
import { moveToExhaust, randomFromHand } from './piles.ts';
import { environmentRules, liveStance, pilotRules } from './rules.ts';

/** Where the line sits for this run. Relics can move it; nothing else does. */
export function overheatThreshold(state: GameState): number {
  return Math.max(1, HEAT.overheatAt + pilotRules(state).overheatThreshold);
}

/**
 * Damage taken this instant if the turn ended now. 0 below the threshold.
 *
 * A fraction of MAX health, not a flat number: a flat 3 stops mattering the
 * moment the deck is doing forty a turn, which is exactly why Heat was never
 * something anyone had to think about. A fraction scales with the run for free.
 */
export function overheatDamageAt(
  heat: number,
  maxHealth: number,
  threshold: number = HEAT.overheatAt,
): number {
  if (heat < threshold) return 0;
  const over = heat - threshold;
  const pct = HEAT.overheatDamagePctOfMax + over * HEAT.overheatDamagePctPerPoint;
  return Math.max(1, Math.round(maxHealth * pct));
}

/** Everything a Heat gauge needs to state its own consequences. Queried, never recomputed in the UI. */
/**
 * Where the gauge will sit when this turn ends, if you play nothing more.
 *
 * The stance charges Heat at turn end, and until this existed the gauge showed
 * you a number that was not the one you would be judged on: in IAI you read 6
 * against a threshold of 8, ended the turn, and overheated. The stance strip
 * said "+2 Heat at turn end" in words, in a different part of the screen, and
 * combining the two was left to the player — every turn, under time pressure,
 * with the cost of getting it wrong being 8 damage and a burnt card.
 *
 * This file's own comment on the hard cap says it: a cost you cannot read
 * before paying it is the definition of unfair. The same standard applies to a
 * cost you *can* read only by doing arithmetic across two panels.
 *
 * It is a projection, so it is written here rather than in the UI and it walks
 * the same three steps `endPlayerTurn` walks, in the same order — the stance's
 * charge (with the environment's bonus, exactly as `gainHeat` applies it), the
 * stance's vent, and the environment's own decay. A projection that can
 * disagree with the resolution is worse than none.
 */
export function projectedTurnEndHeat(state: GameState): number {
  const combat = requireCombat(state);
  const stance = liveStance(state);
  const rules = environmentRules(state);

  let heat = combat.heat;
  if (stance.heatAtTurnEnd > 0) {
    heat = Math.min(HEAT.max, heat + stance.heatAtTurnEnd + (rules.heatGainBonus ?? 0));
  }
  heat = Math.max(HEAT.min, heat - stance.ventAtTurnEnd);
  heat = Math.max(HEAT.min, heat - (rules.heatDecayPerTurn ?? 0));
  return heat;
}

export function heatStatus(state: GameState): {
  readonly heat: number;
  readonly max: number;
  readonly threshold: number;
  readonly overheating: boolean;
  readonly critical: boolean;
  readonly damageIfTurnEnded: number;
  readonly consequence: string;
  /** Where the gauge lands if you stop here. See `projectedTurnEndHeat`. */
  readonly projected: number;
  /** True when stopping here overheats even though the gauge does not yet. */
  readonly willOverheat: boolean;
} {
  const combat = requireCombat(state);
  const maxHealth = state.run?.pilot.maxHealth ?? 1;
  const threshold = overheatThreshold(state);
  const damage = overheatDamageAt(combat.heat, maxHealth, threshold);
  const atThreshold = overheatDamageAt(threshold, maxHealth, threshold);
  const critical = combat.heat >= HEAT.criticalAt;
  const lostTurn = HEAT.overheatSkipsTurn ? ', gain 0 Energy next turn' : '';
  const projected = projectedTurnEndHeat(state);
  return {
    heat: combat.heat,
    max: HEAT.max,
    threshold,
    overheating: combat.heat >= threshold,
    critical,
    projected,
    willOverheat: combat.heat < threshold && projected >= threshold,
    damageIfTurnEnded: damage,
    consequence:
      damage === 0
        ? `Overheat at ${threshold} — ${atThreshold} damage${lostTurn}, and burn a card`
        : critical
          ? `${damage} damage${lostTurn}, burn a card, and -${HEAT.criticalEnergyLoss} Energy after`
          : `${damage} damage${lostTurn}, and burn a card`,
  };
}

/**
 * Both of these apply the environment's modifier *before* anything is written
 * down, rather than letting a handler top the number up afterwards. A handler
 * reacting to `onHeatGained` by gaining more heat re-enters its own hook, and
 * the resulting number is the sum of a recursion rather than a rule — so
 * Stellar Corona is declared in `EnvironmentRules` and applied here.
 */
export function gainHeat(state: GameState, amount: number, source: string): GameState {
  if (amount <= 0) return state;
  const combat = requireCombat(state);
  const bonus = environmentRules(state).heatGainBonus ?? 0;
  const total = Math.min(HEAT.max, combat.heat + amount + bonus);
  const gained = total - combat.heat;
  if (gained === 0) return state;

  const next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: total })),
    { source, kind: 'heat', text: `Heat +${gained} (${total}/${HEAT.max}).`, detail: { total } },
  );
  return fireHook(next, 'onHeatGained', { amount: gained, total });
}

export function ventHeat(state: GameState, amount: number, source: string): GameState {
  if (amount <= 0) return state;
  const combat = requireCombat(state);
  const total = Math.max(HEAT.min, combat.heat - amount);
  const vented = combat.heat - total;
  if (vented === 0) return state;

  const next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: total })),
    { source, kind: 'heat', text: `Vented ${vented} Heat (${total}/${HEAT.max}).`, detail: { total } },
  );
  return fireHook(next, 'onHeatVented', { amount: vented, total });
}

/**
 * Has the gauge hit the hard ceiling?
 *
 * The soft line at `overheatAt` is checked when the turn ends, because it is a
 * price for how you *finished* the turn. The ceiling is different: reaching it
 * ends the turn there and then, whoever pushed it. That is what makes the top
 * of the gauge a wall rather than a slightly worse version of the line below
 * it — and it is why a Scald ticking you to the top at the start of a turn
 * takes the turn, rather than letting you play a full hand at maximum Heat
 * with nothing to lose.
 */
export function atCriticalHeat(state: GameState): boolean {
  const combat = state.run?.combat ?? null;
  return combat !== null && combat.outcome === 'ongoing' && combat.heat >= HEAT.criticalAt;
}

/**
 * End of the player's turn. Runs *after* the stance passive, so IAI's +1 can
 * be the point that tips you over — which is the whole bargain IAI offers.
 */
export function resolveOverheat(state: GameState): GameState {
  const combat = requireCombat(state);
  const damage = overheatDamageAt(combat.heat, state.run?.pilot.maxHealth ?? 1, overheatThreshold(state));
  if (damage === 0) return state;

  const heat = combat.heat;
  let next = appendLog(state, {
    source: 'heat',
    kind: 'heat',
    text: `Overheat at ${heat}.`,
    detail: { heat, damage },
  });

  // The turn is the real cost. Damage you can heal; a turn spent watching the
  // fight happen without you is what makes the gauge something to plan around
  // rather than a tax you pay at the end of a good turn.
  if (HEAT.overheatSkipsTurn) {
    next = appendLog(
      withCombat(next, (current) => ({ ...current, skipNextTurn: true })),
      { source: 'heat', kind: 'heat', text: 'The reactor takes the next turn.', detail: null },
    );
  }

  next = fireHook(next, 'onOverheat', { heat, damage });
  next = applyDirectDamage(next, PLAYER, damage, 'heat', `overheat at ${heat}`);

  // Burn a card from hand. Random, on the `combat` stream — the one place the
  // player does not choose, and it is a consequence of a threshold they could
  // see coming all turn.
  const run = requireRun(next);
  if (run.combat !== null && run.combat.hand.length > 0) {
    const rolled = randomFromHand(run.combat, run.rng, 1);
    const burned = rolled.picked[0];
    if (burned !== undefined) {
      next = withRun(next, (current) => ({
        ...current,
        rng: rolled.rng,
        combat: current.combat === null ? null : moveToExhaust(current.combat, burned),
      }));
      next = appendLog(next, {
        source: 'heat',
        kind: 'heat',
        text: `${cardTable.find(burned.defId)?.name ?? burned.defId} burned away.`,
        detail: { card: burned.defId },
      });
      next = fireHook(next, 'onCardExhausted', { cardUid: burned.uid, cardId: burned.defId });
    }
  }

  if (heat >= HEAT.criticalAt) {
    next = appendLog(
      withCombat(next, (current) => ({
        ...current,
        energyPenaltyNextTurn: current.energyPenaltyNextTurn + HEAT.criticalEnergyLoss,
      })),
      {
        source: 'heat',
        kind: 'heat',
        text: `Critical. -${HEAT.criticalEnergyLoss} Energy next turn.`,
        detail: null,
      },
    );
  }

  return next;
}
