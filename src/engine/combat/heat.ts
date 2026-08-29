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
import { cards as cardTable, statuses as statusTable } from '../../content/registry.ts';
import { PLAYER, applyDirectDamage } from './damage.ts';
import { addStacks } from './keywords.ts';
import { moveToExhaust, randomFromHand } from './piles.ts';
import { environmentRules, pilotRules } from './rules.ts';

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
 *
 * The same fraction at every point above the line. It used to climb with the
 * gauge, which turned "should I end the turn here" into arithmetic the player
 * had to redo on every point — see `HEAT.overheatDamagePctOfMax`. `threshold`
 * still matters: it is where the charge starts, and relics move it.
 */
export function overheatDamageAt(
  heat: number,
  maxHealth: number,
  threshold: number = HEAT.overheatAt,
): number {
  if (heat < threshold) return 0;
  return Math.max(1, Math.round(maxHealth * HEAT.overheatDamagePctOfMax));
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
  const maxHealth = state.run?.pilot.maxHealth ?? 1;
  const threshold = overheatThreshold(state);
  const damage = overheatDamageAt(combat.heat, maxHealth, threshold);
  const atThreshold = overheatDamageAt(threshold, maxHealth, threshold);
  const critical = combat.heat >= HEAT.criticalAt;
  const lostTurn = HEAT.overheatSkipsTurn ? ', gain 0 Energy next turn' : '';
  return {
    heat: combat.heat,
    max: HEAT.max,
    threshold,
    overheating: combat.heat >= threshold,
    critical,
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
export function gainHeat(
  state: GameState,
  amount: number,
  source: string,
  /**
   * `fromCard: true` is the only thing Stellar Corona surcharges. A stance
   * tick, a Scald tick and an enemy move all reach here too, and taxing those
   * made the corona a rule about the clock rather than a rule about the cards
   * in your hand — which is the version a player can actually play around.
   */
  options: { readonly fromCard?: boolean } = {},
): GameState {
  if (amount <= 0) return state;
  const combat = requireCombat(state);
  const bonus = options.fromCard === true ? (environmentRules(state).heatGainBonus ?? 0) : 0;
  const total = Math.min(HEAT.max, combat.heat + amount + bonus);
  const gained = total - combat.heat;
  if (gained === 0) return state;

  const next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: total })),
    /* `gained` rather than only `total`: a gain and a vent are both `kind:
       'heat'` and the presentation layer has to tell them apart to answer them
       differently. Matching on the TEXT would be a parser over prose. */
    { source, kind: 'heat', text: `Heat +${gained} (${total}/${HEAT.max}).`, detail: { total, gained } },
  );
  return fireHook(next, 'onHeatGained', { amount: gained, total });
}

export function ventHeat(
  state: GameState,
  amount: number,
  source: string,
  /**
   * `shed: false` vents without shedding the statuses that a vent normally
   * sheds. Used when the same card just applied one — over a turn that trade is
   * deliberate, but inside one card it is two halves that cancel.
   */
  options: { readonly shed?: boolean } = {},
): GameState {
  if (amount <= 0) return state;
  const combat = requireCombat(state);
  const total = Math.max(HEAT.min, combat.heat - amount);
  const vented = combat.heat - total;
  if (vented === 0) return state;

  let next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: total })),
    { source, kind: 'heat', text: `Vented ${vented} Heat (${total}/${HEAT.max}).`, detail: { total, vented } },
  );

  /* A vent worth the name sheds the statuses that declare it.
   *
   * The size is the vent's OWN size — what the card or the stance said — not
   * how much of it the gauge happened to have to give. It was the latter, and
   * that is the bug: an enemy applies Scald, your turn opens with the 1 Heat
   * the Scald itself just handed you, and Stillwater Guard's "Vent 2" vents 1
   * and sheds nothing. The card says 2, Scald says "venting 2 or more sheds a
   * stack", both are true, and the stack stays — with nothing on screen
   * explaining why. Counterplay that reads as broken is worse than no
   * counterplay.
   *
   * The exploit that rule was guarding against is still shut, one line up:
   * a vent against an empty gauge vents nothing and returns before it gets
   * here, so "hold a big vent and fire it at zero Heat" still buys nothing.
   * You have to actually be venting something.
   *
   * One stack per vent, however large. Scald is meant to cost you turns to
   * unwind, not to evaporate the moment you draw the right card. */
  if (options.shed !== false) next = shedOnVent(next, amount, source);

  return fireHook(next, 'onHeatVented', { amount: vented, total });
}

/**
 * Drop one stack of every status whose `shedOnVent` this vent has met.
 *
 * `size` is what the vent was FOR, not what it moved — see the call site.
 */
function shedOnVent(state: GameState, size: number, source: string): GameState {
  const combat = requireCombat(state);
  const shedding = combat.statuses.filter((held) => {
    const threshold = statusTable.find(held.status)?.shedOnVent;
    return threshold !== undefined && size >= threshold;
  });
  if (shedding.length === 0) return state;

  let next = state;
  for (const held of shedding) {
    const def = statusTable.find(held.status);
    if (def === undefined) continue;
    next = withCombat(next, (current) => ({
      ...current,
      statuses: addStacks(current.statuses, held.status, -1),
    }));
    next = appendLog(next, {
      source,
      kind: 'status',
      text: `${def.name} -1, shed by the vent.`,
      detail: { status: held.status },
    });
  }
  return next;
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

/** Does the reactor still have a card to take? Drives the UI's playback timer. */
export function burnPending(state: GameState): boolean {
  const combat = state.run?.combat ?? null;
  return combat !== null && combat.outcome === 'ongoing' && combat.burnOwed > 0;
}

/**
 * Take one card the reactor is owed, out of the hand.
 *
 * Random, on the `combat` stream — the one place the player does not choose,
 * and it is the consequence of a threshold they could see coming all turn.
 *
 * Dispatched by the UI a beat after the hand is dealt so the card burns where
 * the player can see it, and swept up by `endPlayerTurn` if it somehow was not
 * — a debt the reactor forgets is a rule that only applies sometimes.
 */
export function collectBurn(state: GameState): GameState {
  const combat = state.run?.combat ?? null;
  if (combat === null || combat.outcome !== 'ongoing' || combat.burnOwed <= 0) return state;

  // Nothing to take. The debt still clears: it is a card off THIS hand or none,
  // not an IOU that follows you into a turn you can actually use.
  if (combat.hand.length === 0) {
    return withCombat(state, (current) => ({ ...current, burnOwed: 0 }));
  }

  const run = requireRun(state);
  if (run.combat === null) return state;
  const rolled = randomFromHand(run.combat, run.rng, 1);
  const burned = rolled.picked[0];
  if (burned === undefined) {
    return withCombat(state, (current) => ({ ...current, burnOwed: 0 }));
  }

  let next = withRun(state, (current) => ({
    ...current,
    rng: rolled.rng,
    combat:
      current.combat === null
        ? null
        : { ...moveToExhaust(current.combat, burned), burnOwed: current.combat.burnOwed - 1 },
  }));
  next = appendLog(next, {
    source: 'heat',
    kind: 'heat',
    text: `${cardTable.find(burned.defId)?.name ?? burned.defId} burned away.`,
    detail: { card: burned.defId, burned: burned.uid },
  });
  return fireHook(next, 'onCardExhausted', { cardUid: burned.uid, cardId: burned.defId });
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
  /* The gauge empties HERE, in the same breath as the log line that says so.
   *
   * It did not. The entry claimed `total: 0, vented: 8` and the state went on
   * holding 8 until the *next* turn started, where the reactor-vent branch
   * cleared it — so for the whole enemy phase the animation and the state
   * disagreed about the single biggest thing the gauge ever does. The visible
   * result was the bug that survived two attempts to fix it in the animation
   * layer, where it never was: the ticks walked honestly down to zero, the walk
   * finished, and the very next render read the state, found 8 still sitting
   * there, and painted the gauge full again — for about half a second, until
   * the next turn finally zeroed it and it fell a second time.
   *
   * A log entry is a description of a state change. One that describes a change
   * happening a turn later is not a description, it is a promise, and the
   * presentation layer has no way to tell the difference.
   *
   * The turn-start branch keeps its own clear: an enemy can add Heat during the
   * phase between, and a vent turn is meant to open cold. */
  let next = appendLog(
    withCombat(state, (current) => ({ ...current, heat: HEAT.min })),
    {
      source: 'heat',
      kind: 'heat',
      /* `total` and `vented` as well, because an overheat empties the gauge and
         the presentation layer has no other way to know that. Without them the
         ticks jumped from full to nothing with no animation and no sound — the
         single largest thing the gauge ever does, said the most quietly. */
      text: `Overheat at ${heat}.`,
      detail: { heat, damage, total: HEAT.min, vented: heat - HEAT.min },
    },
  );

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

  /* The card is OWED, not taken.
   *
   * It used to be taken here, out of the hand that was about to be discarded
   * anyway — correct, and completely invisible. The most memorable thing an
   * overheat does happened to a card in a hand that was already on its way to
   * the pile, in the same frame, with nothing to look at.
   *
   * `collectBurn` takes it after the next hand is dealt instead. The cost is
   * identical: a vent turn hands you 0 Energy, so a card off that hand is a
   * card you could not have played either way. What changes is that you watch
   * it go. */
  next = withCombat(next, (current) => ({ ...current, burnOwed: current.burnOwed + 1 }));
  next = appendLog(next, {
    source: 'heat',
    kind: 'heat',
    text: 'A card will burn out of the next hand.',
    detail: null,
  });

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
