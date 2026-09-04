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
import { RARITY_ORDER } from '../types.ts';
import { chance, nextFloat, pick, sample, weightedPick } from '../rng.ts';
import {
  ACTIVE_STANCES,
  BOSS_IMPLANT_WEIGHTS,
  ELITE_CARD_WEIGHTS,
  MASTERY,
  RARITY_WEIGHTS,
  RELIC_COMBAT_CHANCE,
  RELIC_COMBAT_PITY,
  RELIC_COMBAT_WEIGHTS,
  RELIC_ELITE_WEIGHTS,
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

/* `archetypeLean` was here: it worked out which archetype the player's CHOSEN
   cards leaned toward, and the drought nudge used it to up-weight that
   archetype on later reward screens.

   Gone with the nudge. It is deliberately deleted rather than left unused: a
   function in this module that answers "what is this player building" is a
   loaded gun in a file whose whole job is now to not know. The reward roll
   reads the act and the rarity table and nothing else.
*/

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
        card.rarity !== 'mythic' &&
        card.rarity !== 'artifact' &&
        card.type !== 'status' &&
        card.type !== 'voided' &&
        card.exclusive !== true,
    );
}

/**
 * Roll the card choices. Never the same card twice on one screen, and never
 * weighted by anything about the deck.
 *
 * There used to be a drought nudge here that up-weighted the deck's own
 * archetype after three unhelpful screens. It is gone on purpose: an offer that
 * reads what you have already taken is an offer you cannot trust, because you
 * can no longer tell a helping hand from a pattern you invented. Rarity and the
 * act are the only inputs.
 */
export function rollCardChoices(
  rng: RngState,
  act: 1 | 2 | 3,
  tier: 'combat' | 'elite' | 'boss' = 'combat',
): { readonly cardIds: readonly CardId[]; readonly rng: RngState } {
  const pool = offerableCards();
  if (pool.length === 0) return { cardIds: [], rng };

  /* A boss offers one tier, flat — `REWARDS.bossOfferRarity`.
  
     Same argument as its relics: the tier is the finale's, not a roll's, and
     the three have to be comparable to each other or the screen is one right
     answer with two decorations beside it. The archetype nudge is dropped here
     too — the nudge exists to rescue a run that keeps being offered nothing it
     wants, and a full tier of cards is not one of those.

     The IMPLANT row is the one exception and it rolls its tier; see
     `rollBossImplants` for why the two differ. */
  if (tier === 'boss') {
    const epics = pool.filter((card) => card.rarity === REWARDS.bossOfferRarity);
    if (epics.length > 0) {
      const picked = sample(rng, 'rewards', epics, Math.min(REWARDS.cardChoices, epics.length));
      return { cardIds: picked.value.map((card) => card.id), rng: picked.rng };
    }
  }

  /* An Elite's screen has a floor: no commons on it. See `ELITE_CARD_WEIGHTS`
     for the ladder and why the rare tail is untouched.

     Enforced by FILTERING THE POOL rather than by weighting common to zero,
     which matters more than it looks: `weightedPick` throws when every entry it
     is handed weighs nothing, so a zero-weight common would be a live crash the
     moment the last non-common candidate was already on the screen. Filtered,
     the same case falls through the `candidates.length === 0` break below and
     makes a short offer — which is what the relic roll does when a tier runs
     thin, for the same reason. */
  const rarityWeights = tier === 'elite' ? ELITE_CARD_WEIGHTS[act] : RARITY_WEIGHTS[act];
  const offerable =
    tier === 'elite' ? pool.filter((card) => card.rarity !== 'common') : pool;

  const chosen: CardId[] = [];
  let current = rng;

  for (let slot = 0; slot < REWARDS.cardChoices; slot++) {
    const candidates = offerable.filter((card) => !chosen.includes(card.id));
    if (candidates.length === 0) break;

    const entries = candidates.map((card) => ({
      value: card.id,
      weight: card.rarity === 'basic' ? 0 : rarityWeights[card.rarity],
    }));

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
  tier: 'combat' | 'elite' | 'boss' = 'combat',
  /**
   * A Thread's reprisal. Kept as a parameter, and no longer changes the payout.
   *
   * It used to withhold the relic. The argument was sound and the lever was
   * wrong: dropping one made being Marked something a player would deliberately
   * ARRANGE — take the Thread, collect a free Elite drop — which inverts what a
   * Thread is, a consequence you accepted rather than a shop with a fight in
   * front of it.
   *
   * The fix moved to the price instead of the receipt. A reprisal now opens a
   * Vareth hunting party (see `ambushesFor` and `enemies/vareth.ts`) that is
   * harder than the act's real Elites on both hull and damage, and that carries
   * accumulating Strength so stalling it loses. Nobody arranges that for a
   * relic. Withholding the reward on top of it would have been charging twice
   * for one choice, which is the thing the cards were already left in place to
   * avoid.
   *
   * The parameter stays because the call sites read better for saying which
   * kind of fight they are paying out, and because a future Thread may well
   * want a bill that genuinely pays nothing.
   */
  reprisal = false,
): RolledReward {
  void reprisal;
  const cards = rollCardChoices(rng, act, tier);
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
 * Boss only. Everywhere else implants are bought at a Station with Alloy you
 * wanted for something else, which is the right price for a thing that changes
 * what a card is worth. An act finale is the one place the run is allowed to
 * change twice, and asking "what can a turn do" and "what is a card worth" in
 * the same breath is most of what makes a boss read as a chapter ending rather
 * than a bigger enemy.
 *
 * ANY TIER, and all three from the SAME one.
 *
 * The tier used to be fixed at `REWARDS.bossOfferRarity`, which made three
 * bosses hand you three versions of the same screen — and, because the top of
 * the shelf is thin, often literally the same three implants. Rolling the tier
 * makes the finale a thing that can surprise you; keeping all three ON that
 * tier is what stops the roll turning into a non-choice, because a screen
 * offering one mythic and two commons is not a decision, it is a formality.
 *
 * The roll is uniform over the tiers that actually have implants, so a thin
 * tier is not more likely to come up merely for being thin. `sample` is on the
 * `rewards` stream like everything else here.
 *
 * A short offer rather than a padded one when a tier runs low, for the same
 * reason `rollRelics` makes short offers: padding from a neighbouring tier
 * brings back the mixed screen where one option is obviously the answer.
 */
export function rollBossImplants(
  rng: RngState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly implantIds: readonly ImplantId[]; readonly rng: RngState } {
  if (tier !== 'boss') return { implantIds: [], rng };

  const all = implantTable.all();
  /* Read off the pool rather than off the ladder, so a tier nobody has written
     an implant for is not a tier the boss can roll into an empty screen. Sorted
     by the ladder rather than by encounter order — `RARITY_ORDER` — because the
     roll has to be reproducible from the seed and a Set's iteration order is
     the order things happened to be written in. */
  const tiers = RARITY_ORDER.filter(
    (rank) => rank in BOSS_IMPLANT_WEIGHTS && all.some((def) => def.rarity === rank),
  );
  if (tiers.length === 0) return { implantIds: [], rng };

  /* Weighted, not uniform — see `BOSS_IMPLANT_WEIGHTS`. The pool is still read
     first, so a tier nobody has written an implant for cannot be rolled into an
     empty screen however heavily it is weighted. */
  const rolled = weightedPick(
    rng,
    'rewards',
    tiers.map((rank) => ({
      value: rank,
      weight: BOSS_IMPLANT_WEIGHTS[rank as keyof typeof BOSS_IMPLANT_WEIGHTS],
    })),
  );
  const chosen = rolled.value;
  const pool = all.filter((def) => def.rarity === chosen);
  if (pool.length === 0) return { implantIds: [], rng: rolled.rng };

  // Implants stack, so an offer is never filtered against what is already
  // held — a second Honed Edge is a real choice, not a duplicate.
  const picked = sample(rolled.rng, 'rewards', pool, Math.min(REWARDS.implantChoices, pool.length));
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
/**
 * The chance THIS ordinary fight pays a relic, given how dry the run has been.
 *
 * Exported because the reward screen and the simulator both want to show or
 * reason about it, and a second implementation of a rule that decides drops is
 * how two numbers that must agree stop agreeing.
 *
 * Returns 0 rather than the base rate once the cap is reached, and in Act 3
 * where the base is already 0 — pity must not resurrect a curve that was
 * deliberately ended. `Math.max(0, ...)` on the grace keeps a fresh run at
 * exactly the base rate rather than below it.
 */
export function combatRelicChance(run: RunState): number {
  const base = RELIC_COMBAT_CHANCE[run.act];
  if (base <= 0 || run.combatRelicsFound >= RELIC_COMBAT_PITY.cap) return 0;

  /* Distance from neutral, signed. Negative right after a drop, positive on a
     dry streak — so the same expression handles both halves and the two can
     never be tuned apart by accident. Clamped at both ends: `max` because a
     certainty is not a drop, `floor` because an impossibility is worse than a
     long shot. */
  const gap = run.combatRelicDry - RELIC_COMBAT_PITY.neutral;
  const drift = base + gap * RELIC_COMBAT_PITY.step;
  return Math.min(RELIC_COMBAT_PITY.max, Math.max(RELIC_COMBAT_PITY.floor, drift));
}

export function rollRelics(
  rng: RngState,
  run: RunState,
  tier: 'combat' | 'elite' | 'boss',
): { readonly relicIds: readonly RelicId[]; readonly rng: RngState } {
  /* An ordinary fight can drop one early in the run and never late. See
     `RELIC_COMBAT_CHANCE` for why the curve runs that way round, and
     `RELIC_COMBAT_PITY` for why a dry streak bends it.

     Rolled BEFORE the tier roll and on the same stream, so a combat that fails
     the check still costs exactly one draw — an item rate that changed how many
     rolls a fight consumed would make every downstream reward in the act depend
     on whether this one happened to fire. The pity maths only changes the
     PROBABILITY handed to `chance`, never whether it is called, so the stream
     is exactly where it was before this existed. */
  if (tier === 'combat') {
    const gate = chance(rng, 'rewards', combatRelicChance(run));
    if (!gate.value) return { relicIds: [], rng: gate.rng };
    rng = gate.rng;
  }

  // Relics have their own ladder. See RELIC_RARITY_WEIGHTS for why.
  /* Which ladder this offer climbs — one per node type, because the three are
     different rewards wearing the same word. An ordinary fight stops at epic
     (`RELIC_COMBAT_WEIGHTS`); an Elite cannot go BELOW uncommon
     (`RELIC_ELITE_WEIGHTS`); a boss does not roll at all, a few lines down. */
  const rarityWeights =
    tier === 'combat'
      ? RELIC_COMBAT_WEIGHTS
      : tier === 'elite'
        ? RELIC_ELITE_WEIGHTS[run.act]
        : RELIC_RARITY_WEIGHTS[run.act];
  /* `exclusive` never enters an offer. It is granted by name — see the `relic`
     run effect — so a relic that is meant to be earned cannot also be found. */
  const pool = relicTable
    .all()
    .filter((def) => def.exclusive !== true && !run.pilot.relics.includes(def.id));
  if (pool.length === 0) return { relicIds: [], rng };

  /*
   * One tier for the whole offer, rolled first.
   *
   * Rolling each slot independently produced screens with a Common, an Epic and
   * a Mythic side by side, which is not a choice — it is a right answer with
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
  /* Tiers the pool can actually fill AND the ladder is willing to roll. The
     second half is new and it is a guard as much as a rule: `weightedPick`
     throws when handed nothing but zero weights, so an Elite whose pool had
     run down to commons alone — every uncommon and epic already carried — used
     to be a crash waiting on a long run rather than an empty offer. */
  const usable = [...new Set(pool.map((def) => def.rarity))].filter(
    (rarity) => (rarityWeights[rarity as Exclude<Rarity, 'basic'>] ?? 1) > 0,
  );
  if (usable.length === 0) return { relicIds: [], rng };

  /* A boss does not roll its tier. An act finale that hands you an uncommon is
     the boss telling you the last hour did not matter, and a rolled tier means
     the three fights that end the three acts are not comparable to each other.
     Falls back to the roll only if the tier is exhausted, which takes carrying
     every relic on it. */
  if (tier === 'boss' && usable.includes(REWARDS.bossOfferRarity)) {
    const finale = pool.filter((def) => def.rarity === REWARDS.bossOfferRarity);
    const picked = sample(rng, 'rewards', finale, Math.min(REWARDS.relicChoices, finale.length));
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

/* `offerMatchesLean` was here, and `archetypeLean` above it. Both existed only
   to feed the drought counter that biased the next offer toward the deck. With
   the nudge gone there is nothing left to measure — and leaving a function that
   computes "what is this player building" in a module that must not care is an
   invitation to start caring again. */
