/* Heat — the pressure valve.
 *
 * Per-combat, 0-10, starts at 0. It does not decay. You must vent.
 *
 * This is "solutions never fully solve problems" made systemic: your best
 * cards actively build toward your death, which manufactures the arc safe ->
 * strong -> greedy -> threatened -> desperate inside a single fight.
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
import { environmentRules } from './rules.ts';

/** Damage taken this instant if the turn ended now. 0 below the threshold. */
export function overheatDamageAt(heat: number): number {
  if (heat < HEAT.overheatAt) return 0;
  return (heat - HEAT.overheatDamageOffset) * HEAT.overheatDamagePerPoint;
}

/** Everything a Heat gauge needs to state its own consequences. Queried, never recomputed in the UI. */
export function heatStatus(state: GameState): {
  readonly heat: number;
  readonly max: number;
  readonly threshold: number;
  readonly overheating: boolean;
  readonly critical: boolean;
  readonly damageIfTurnEnded: number;
  readonly consequence: string;
} {
  const combat = requireCombat(state);
  const damage = overheatDamageAt(combat.heat);
  const critical = combat.heat >= HEAT.criticalAt;
  return {
    heat: combat.heat,
    max: HEAT.max,
    threshold: HEAT.overheatAt,
    overheating: combat.heat >= HEAT.overheatAt,
    critical,
    damageIfTurnEnded: damage,
    consequence:
      damage === 0
        ? `Overheat at ${HEAT.overheatAt} — ${(HEAT.overheatAt - HEAT.overheatDamageOffset) * HEAT.overheatDamagePerPoint} damage and burn a card`
        : critical
          ? `${damage} damage, burn a card, and -${HEAT.criticalEnergyLoss} Energy next turn`
          : `${damage} damage and burn a card`,
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
  const multiplier = environmentRules(state).ventMultiplier ?? 1;
  const total = Math.max(HEAT.min, combat.heat - Math.floor(amount * multiplier));
  const vented = combat.heat - total;
  if (vented === 0) return state;

  const next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: total })),
    { source, kind: 'heat', text: `Vented ${vented} Heat (${total}/${HEAT.max}).`, detail: { total } },
  );
  return fireHook(next, 'onHeatVented', { amount: vented, total });
}

/**
 * End of the player's turn. Runs *after* the stance passive, so IAI's +1 can
 * be the point that tips you over — which is the whole bargain IAI offers.
 */
export function resolveOverheat(state: GameState): GameState {
  const combat = requireCombat(state);
  const damage = overheatDamageAt(combat.heat);
  if (damage === 0) return state;

  const heat = combat.heat;
  let next = appendLog(state, {
    source: 'heat',
    kind: 'heat',
    text: `Overheat at ${heat}.`,
    detail: { heat, damage },
  });

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
