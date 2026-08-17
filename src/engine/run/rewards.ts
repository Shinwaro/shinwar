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
  Rarity,
  RelicId,
  RewardOffer,
  RngState,
  RunState,
} from '../types.ts';
import { nextFloat, pick, weightedPick } from '../rng.ts';
import { ACTIVE_STANCES, MASTERY, RARITY_WEIGHTS, REWARDS } from '../../content/balance.ts';
import {
  cards as cardTable,
  masteries as masteryTable,
  relics as relicTable,
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
  const withRelics = rollRelics(cards.rng, run, tier);

  return {
    offer: {
      cardIds: cards.cardIds,
      relicIds: withRelics.relicIds,
      takenRelic: null,
      alloy,
      taken: [],
      alloyClaimed: false,
    },
    rng: withRelics.rng,
  };
}

/**
 * Three relics at an act finale, and you take one.
 *
 * A boss should hand you a decision about what the rest of the run is, not a
 * thing that happened to you — which is what a granted Stance Mastery was. The
 * Masteries are still in the game; they moved to the Station, where wanting one
 * costs you the Alloy you were going to spend on something else.
 */
export function rollRelics(
  rng: RngState,
  run: RunState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly relicIds: readonly RelicId[]; readonly rng: RngState } {
  if (tier !== 'boss') return { relicIds: [], rng };

  const rarityWeights = RARITY_WEIGHTS[run.act];
  const pool = relicTable.all().filter((def) => !run.pilot.relics.includes(def.id));
  if (pool.length === 0) return { relicIds: [], rng };

  const chosen: RelicId[] = [];
  let current = rng;
  for (let slot = 0; slot < REWARDS.relicChoices; slot++) {
    const candidates = pool.filter((def) => !chosen.includes(def.id));
    if (candidates.length === 0) break;
    const rolled = weightedPick(
      current,
      'rewards',
      candidates.map((def) => ({
        value: def.id,
        weight: rarityWeights[def.rarity as Exclude<Rarity, 'basic'>] ?? 1,
      })),
    );
    current = rolled.rng;
    chosen.push(rolled.value);
  }

  return { relicIds: chosen, rng: current };
}

/**
 * A Stance Mastery for the Station's shelf.
 *
 * No longer a boss drop: rewriting a stance is a thing a player should be able
 * to *want*, not something an act finale decides for them. Capped, because a
 * mastery rewrites how the whole deck reads, and one per stance, because two on
 * the same stance compose by overwriting each other field by field.
 *
 * Only masteries for stances actually in rotation are eligible: one that
 * rewrites a dormant stance would be an item that does nothing.
 */
export function rollMastery(
  rng: RngState,
  run: RunState,
  tier: 'combat' | 'elite' | 'boss' | 'shop',
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

/** Did this screen offer anything matching the deck's lean? Feeds the drought counter. */
export function offerMatchesLean(offer: RewardOffer, run: RunState): boolean {
  const lean = archetypeLean(run);
  if (lean === 'neutral') return true;
  return offer.cardIds.some((id) => cardTable.find(id)?.archetype === lean);
}
