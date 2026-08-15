/* Reward generation.
 *
 * Three card choices plus Skip, and Skip is always real — a reward you must
 * take is not a decision, and a bloated deck is its own punishment.
 *
 * Weighted, never a flat bag: rarity shifts by act, and the anti-frustration
 * nudge softly favours the archetype the deck is already leaning into. Soft,
 * not guaranteed. The goal is fewer dead runs, not handing the player a build.
 */

import type { Archetype, CardDef, CardId, RewardOffer, RngState, RunState } from '../types.ts';
import { weightedPick } from '../rng.ts';
import { RARITY_WEIGHTS, REWARDS } from '../../content/balance.ts';
import { cards as cardTable } from '../../content/registry.ts';

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
 * The pool a reward may draw from. `all()` is sorted by id, so the candidate
 * list never depends on import order — a reshuffled import would otherwise
 * silently change every seed's rewards.
 */
function eligible(): readonly CardDef[] {
  return cardTable
    .all()
    .filter((card) => card.rarity !== 'basic' && card.type !== 'status' && card.type !== 'curse');
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
  const pool = eligible();
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
): RolledReward {
  const cards = rollCardChoices(rng, run, act, drought);
  return {
    offer: { cardIds: cards.cardIds, alloy, taken: [], alloyClaimed: false },
    rng: cards.rng,
  };
}

/** Did this screen offer anything matching the deck's lean? Feeds the drought counter. */
export function offerMatchesLean(offer: RewardOffer, run: RunState): boolean {
  const lean = archetypeLean(run);
  if (lean === 'neutral') return true;
  return offer.cardIds.some((id) => cardTable.find(id)?.archetype === lean);
}
