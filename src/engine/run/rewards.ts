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
  ImplantId,
  MasteryId,
  Rarity,
  RelicId,
  RewardOffer,
  RngState,
  RunState,
} from '../types.ts';
import { nextFloat, pick, sample, weightedPick } from '../rng.ts';
import {
  ACTIVE_STANCES,
  MASTERY,
  RARITY_WEIGHTS,
  RELIC_RARITY_WEIGHTS,
  REWARDS,
} from '../../content/balance.ts';
import {
  cards as cardTable,
  implants as implantTable,
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
        /* The top two tiers are the Reliquary's, and nothing else may hand one
           out. A legendary is by definition the card you build around, so a
           die roll in Act 3 delivers it after the deck is already finished —
           and a run that never rolled one never had the choice at all. One per
           run, at a known place, chosen. See `content/events/reliquary.ts`. */
        card.rarity !== 'legendary' &&
        card.rarity !== 'artifact' &&
        card.type !== 'status' &&
        card.type !== 'voided' &&
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
  tier: 'combat' | 'elite' | 'boss' = 'combat',
): { readonly cardIds: readonly CardId[]; readonly rng: RngState } {
  const pool = offerableCards();
  if (pool.length === 0) return { cardIds: [], rng };

  /* A boss offers epics, and offers them flat.
  
     Same argument as its relics and implants: the tier is the finale's, not a
     roll's, and the three have to be comparable to each other or the screen is
     one right answer with two decorations beside it. The archetype nudge is
     dropped here too — the nudge exists to rescue a run that keeps being
     offered nothing it wants, and eleven epics is not a drought. */
  if (tier === 'boss') {
    const epics = pool.filter((card) => card.rarity === REWARDS.bossOfferRarity);
    if (epics.length > 0) {
      const picked = sample(rng, 'rewards', epics, Math.min(REWARDS.cardChoices, epics.length));
      return { cardIds: picked.value.map((card) => card.id), rng: picked.rng };
    }
  }

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
  const cards = rollCardChoices(rng, run, act, drought, tier);
  const withRelics = rollRelics(cards.rng, run, tier);
  const withImplants = rollBossImplants(withRelics.rng, tier);

  return {
    offer: {
      cardIds: cards.cardIds,
      relicIds: withRelics.relicIds,
      takenRelic: null,
      implantIds: withImplants.implantIds,
      takenImplant: null,
      alloy,
      taken: [],
      alloyClaimed: false,
    },
    rng: withImplants.rng,
  };
}

/**
 * Three implants at a boss, alongside the three relics.
 *
 * Boss only, and always epic — see `REWARDS.bossOfferRarity`. Everywhere else
 * implants are bought at a Station with Alloy you wanted for something else,
 * which is the right price for a thing that changes what a card is worth. An
 * act finale is the one place the run is allowed to change twice, and asking
 * "what can a turn do" and "what is a card worth" in the same breath is most of
 * what makes a boss read as a chapter ending rather than a bigger enemy.
 *
 * A short offer rather than a padded one when the tier runs low, for the same
 * reason `rollRelics` makes short offers: padding from a neighbouring tier
 * brings back the mixed screen where one option is obviously the answer.
 */
export function rollBossImplants(
  rng: RngState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly implantIds: readonly ImplantId[]; readonly rng: RngState } {
  if (tier !== 'boss') return { implantIds: [], rng };

  const pool = implantTable
    .all()
    .filter((def) => def.rarity === REWARDS.bossOfferRarity);
  if (pool.length === 0) return { implantIds: [], rng };

  // Implants stack, so an offer is never filtered against what is already
  // held — a second Honed Edge is a real choice, not a duplicate.
  const picked = sample(rng, 'rewards', pool, Math.min(REWARDS.implantChoices, pool.length));
  return { implantIds: picked.value.map((def) => def.id), rng: picked.rng };
}

/**
 * Three relics at an act finale, and you take one.
 *
 * A boss should hand you a decision about what the rest of the run is, not a
 * thing that happened to you — which is what a granted Stance Mastery was. The
 * Masteries are still in the game; they moved to the Station, where wanting one
 * costs you the Alloy you were going to spend on something else.
 *
 * **Elites drop one too, and that is the whole power curve.** They used to be
 * boss-only, which meant the first relic in a run arrived at the *end* of Act 1
 * — so for the entire first act the player was the same character they started
 * as, with a deck that had only got bigger. A bigger deck is not progression; it
 * is usually the opposite. Relics are the only thing in the game that changes
 * what a turn can do (an Energy, a card, 3 Block, +2 on every attack), so they
 * have to start arriving early enough to build on.
 *
 * This is also what finally makes routing into an Elite a decision rather than a
 * tax. `chooseNode` in the simulator now has something real to weigh.
 */
export function rollRelics(
  rng: RngState,
  run: RunState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly relicIds: readonly RelicId[]; readonly rng: RngState } {
  if (tier === 'combat') return { relicIds: [], rng };

  // Relics have their own ladder. See RELIC_RARITY_WEIGHTS for why.
  const rarityWeights = RELIC_RARITY_WEIGHTS[run.act];
  const pool = relicTable.all().filter((def) => !run.pilot.relics.includes(def.id));
  if (pool.length === 0) return { relicIds: [], rng };

  /*
   * One tier for the whole offer, rolled first.
   *
   * Rolling each slot independently produced screens with a common, a rare and
   * a legendary side by side, which is not a choice — it is a right answer with
   * two decorations next to it. Picking the tier first and then filling from it
   * means the three are comparable, and the decision is which effect suits the
   * build rather than which border is shiniest.
   *
   * A tier with fewer than `relicChoices` left in it makes a SHORT offer rather
   * than being skipped or padded from a neighbour. Padding brings back the
   * mixed screen this exists to prevent; skipping made the artifact tier
   * unreachable forever, because there is exactly one artifact relic and there
   * was never going to be a third. "Here is the one artifact, take it or leave
   * it" is a perfectly good screen — and its weight is what keeps it rare, not
   * a filter that hides it.
   */
  const usable = [...new Set(pool.map((def) => def.rarity))];

  /* A boss does not roll its tier. An act finale that hands you an uncommon is
     the boss telling you the last hour did not matter, and a rolled tier means
     the three fights that end the three acts are not comparable to each other.
     Falls back to the roll only if the tier is exhausted, which takes carrying
     every epic relic in the game. */
  if (tier === 'boss' && usable.includes(REWARDS.bossOfferRarity)) {
    const epics = pool.filter((def) => def.rarity === REWARDS.bossOfferRarity);
    const picked = sample(rng, 'rewards', epics, Math.min(REWARDS.relicChoices, epics.length));
    return { relicIds: picked.value.map((def) => def.id), rng: picked.rng };
  }

  const tierRoll = weightedPick(
    rng,
    'rewards',
    usable.map((rarity) => ({
      value: rarity,
      weight: rarityWeights[rarity as Exclude<Rarity, 'basic'>] ?? 1,
    })),
  );
  const offerRarity = tierRoll.value;
  const tierPool = pool.filter((def) => def.rarity === offerRarity);

  const chosen: RelicId[] = [];
  let current = tierRoll.rng;
  for (let slot = 0; slot < REWARDS.relicChoices; slot++) {
    const candidates = tierPool.filter((def) => !chosen.includes(def.id));
    if (candidates.length === 0) break;
    const rolled = pick(current, 'rewards', candidates);
    current = rolled.rng;
    chosen.push(rolled.value.id);
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
