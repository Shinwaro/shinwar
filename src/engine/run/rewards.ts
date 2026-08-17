/* Reward generation.
 *
 * Three card choices plus Skip, and Skip is always real — a reward you must
 * take is not a decision, and a bloated deck is its own punishment.
 *
 * Weighted, never a flat bag: rarity shifts by act, and the anti-frustration
 * nudge softly favours the archetype the deck is already leaning into. Soft,
 * not guaranteed. The goal is fewer dead runs, not handing the player a build.
 */

import type {
  Archetype,
  CardDef,
  CardId,
  MasteryId,
  RewardOffer,
  RngState,
  RunState,
} from '../types.ts';
import { nextFloat, pick, weightedPick } from '../rng.ts';
import { ACTIVE_STANCES, MASTERY, RARITY_WEIGHTS, REWARDS } from '../../content/balance.ts';
import {
  cards as cardTable,
  masteries as masteryTable,
  modules as moduleTable,
} from '../../content/registry.ts';

export interface RolledReward {
  readonly offer: RewardOffer;
  readonly rng: RngState;
}

/**
 * Which way the deck leans. Basic cards are excluded — the starting deck is
 * the same for everyone, so counting it would say every deck leans the same.
 */
export function archetypeLean(run: RunState): Archetype {
  const counts = new Map<Archetype, number>();
  for (const instance of run.pilot.deck) {
    const def = cardTable.find(instance.defId);
    if (def === undefined || def.rarity === 'basic') continue;
    counts.set(def.archetype, (counts.get(def.archetype) ?? 0) + 1);
  }

  let best: Archetype = 'neutral';
  let bestCount = 0;
  // Sorted so a tie resolves the same way every time rather than by Map order.
  for (const [archetype, count] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (count > bestCount) {
      best = archetype;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The pool a reward or a shop may draw from. `all()` is sorted by id, so the
 * candidate list never depends on import order — a reshuffled import would
 * otherwise silently change every seed's rewards.
 *
 * `exclusive` cards are the payoff of one specific choice. Rolling one here
 * would take the point out of having made that choice.
 */
export function offerableCards(): readonly CardDef[] {
  return cardTable
    .all()
    .filter(
      (card) =>
        card.rarity !== 'basic' &&
        card.type !== 'status' &&
        card.type !== 'curse' &&
        card.exclusive !== true,
    );
}

/**
 * Roll the card choices. Never the same card twice on one screen, and the
 * drought nudge up-weights the deck's lean once the player has gone
 * `archetypeDroughtBeforeNudge` screens without a match.
 */
export function rollCardChoices(
  rng: RngState,
  run: RunState,
  act: 1 | 2 | 3,
  drought: number,
): { readonly cardIds: readonly CardId[]; readonly rng: RngState } {
  const pool = offerableCards();
  if (pool.length === 0) return { cardIds: [], rng };

  const lean = archetypeLean(run);
  const nudging = drought >= REWARDS.archetypeDroughtBeforeNudge;
  const rarityWeights = RARITY_WEIGHTS[act];

  const chosen: CardId[] = [];
  let current = rng;

  for (let slot = 0; slot < REWARDS.cardChoices; slot++) {
    const candidates = pool.filter((card) => !chosen.includes(card.id));
    if (candidates.length === 0) break;

    const entries = candidates.map((card) => {
      const base = card.rarity === 'basic' ? 0 : rarityWeights[card.rarity];
      const boost = nudging && card.archetype === lean ? REWARDS.archetypeNudgeMultiplier : 1;
      return { value: card.id, weight: base * boost };
    });

    const rolled = weightedPick(current, 'rewards', entries);
    current = rolled.rng;
    chosen.push(rolled.value);
  }

  return { cardIds: chosen, rng: current };
}

export function rollReward(
  rng: RngState,
  run: RunState,
  act: 1 | 2 | 3,
  alloy: number,
  drought: number,
  tier: 'combat' | 'elite' | 'boss' = 'combat',
): RolledReward {
  const cards = rollCardChoices(rng, run, act, drought);
  // Elites drop a module — guaranteed, per DESIGN.md §3. That is what makes
  // routing toward one a real decision rather than just more Alloy.
  const withModule =
    tier === 'elite' || tier === 'boss'
      ? rollModule(cards.rng, run)
      : { moduleIds: [], rng: cards.rng };
  const withMastery = rollMastery(withModule.rng, run, tier);

  return {
    offer: {
      cardIds: cards.cardIds,
      moduleIds: withModule.moduleIds,
      masteryId: withMastery.masteryId,
      alloy,
      taken: [],
      takenModules: [],
      alloyClaimed: false,
    },
    rng: withMastery.rng,
  };
}

/**
 * A Stance Mastery: always from a boss, sometimes from an Elite.
 *
 * Never from a normal fight, and capped, because a mastery rewrites how the
 * whole deck reads. Three is already two rewrites of a two-stance game — past
 * that they stop being run-defining and start being a stat line.
 *
 * Only masteries for stances actually in rotation are eligible: one that
 * rewrites a dormant stance would be a reward that does nothing.
 */
export function rollMastery(
  rng: RngState,
  run: RunState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly masteryId: MasteryId | null; readonly rng: RngState } {
  if (tier === 'combat') return { masteryId: null, rng };
  if (run.pilot.masteries.length >= MASTERY.cap) return { masteryId: null, rng };

  const active = new Set(ACTIVE_STANCES);
  // One per stance. Two masteries rewriting the same stance would compose by
  // overwriting each other field by field, so the second would silently undo
  // half the first — the player would be told they earned something and then
  // watch the stance strip disagree with it.
  const taken = new Set(
    run.pilot.masteries.map((id) => masteryTable.find(id)?.stance).filter((stance) => stance !== undefined),
  );
  const pool = masteryTable
    .all()
    .filter(
      (def) =>
        active.has(def.stance) && !run.pilot.masteries.includes(def.id) && !taken.has(def.stance),
    );
  if (pool.length === 0) return { masteryId: null, rng };

  if (tier === 'elite') {
    const roll = nextFloat(rng, 'rewards');
    if (roll.value >= MASTERY.eliteChance) return { masteryId: null, rng: roll.rng };
    const picked = pick(roll.rng, 'rewards', pool);
    return { masteryId: picked.value.id, rng: picked.rng };
  }

  const picked = pick(rng, 'rewards', pool);
  return { masteryId: picked.value.id, rng: picked.rng };
}

/** One module the player does not already own, weighted by rarity. */
function rollModule(
  rng: RngState,
  run: RunState,
): { readonly moduleIds: readonly string[]; readonly rng: RngState } {
  const owned = new Set([...run.ship.stored, ...run.ship.placed.map((entry) => entry.moduleId)]);
  const pool = moduleTable.all().filter((def) => def.rarity !== 'basic' && !owned.has(def.id));
  if (pool.length === 0) return { moduleIds: [], rng };

  const rolled = weightedPick(
    rng,
    'rewards',
    pool.map((def) => ({ value: def.id, weight: MODULE_WEIGHTS[def.rarity] ?? 1 })),
  );
  return { moduleIds: [rolled.value], rng: rolled.rng };
}

const MODULE_WEIGHTS: Readonly<Record<string, number>> = {
  common: 50,
  uncommon: 32,
  rare: 14,
  epic: 3,
  legendary: 0.9,
  artifact: 0.1,
};

/** Did this screen offer anything matching the deck's lean? Feeds the drought counter. */
export function offerMatchesLean(offer: RewardOffer, run: RunState): boolean {
  const lean = archetypeLean(run);
  if (lean === 'neutral') return true;
  return offer.cardIds.some((id) => cardTable.find(id)?.archetype === lean);
}
