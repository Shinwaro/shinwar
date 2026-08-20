/* Every tuning number in the game, in one file, so it can be moved without
 * touching logic. Nothing here is a constant of nature — these are v0 values
 * from DESIGN.md §8 and the build prompt §5, and the simulator moves them.
 *
 * `BALANCE.md` (M6) explains why each one is what it is. Until then the
 * comments here carry the reasoning.
 */

import type { Archetype, Rarity, StanceId } from '../engine/types.ts';

/* ---------- the player ---------- */

/* The ronin. These are the numbers for combat on foot — the deckbuilder. */
export const PLAYER = {
  /** DESIGN.md §8's 70 now belongs to the body, not the cutter. */
  maxHealth: 70,
  energyPerTurn: 3,
  drawPerTurn: 5,
  startingDeckSize: 12,
  startingAlloy: 0,
} as const;

/* ---------- heat ----------
   Per-combat, does not decay, must be vented. Always shown as an exact number
   with the threshold and its consequence spelled out — Darkest Dungeon's
   lesson: opacity did not add tension, it added confusion. */

export const HEAT = {
  min: 0,
  /**
   * The gauge runs to 10 and overheats at 8.
   *
   * It was briefly 20, tripping above 10, because a request to "only overheat
   * past 10" is unreachable on a ten-point bar. Doubling it was the wrong way to
   * grant that: the cards stayed on the old scale, so every source of Heat
   * collapsed onto the stance clock and IAI crossed the line on turn three no
   * matter what you played. Pressure the player cannot decline is a tax, not a
   * decision.
   *
   * Back on the original scale, where the numbers on the cards and the numbers
   * on the gauge are the same size. If the line needs to move, move the line —
   * not the whole scale underneath it.
   */
  max: 10,
  /** At or above this at the end of your turn. */
  overheatAt: 8,
  /**
   * Overheating costs a percentage of MAX health, not a flat number.
   *
   * A flat 3 stops mattering the moment the deck is doing 40 a turn, which is
   * exactly why Heat never became a thing anyone thought about. A fraction of
   * max scales with the run for free and keeps the threshold as frightening in
   * Act 3 as it was in Act 1.
   */
  overheatDamagePctOfMax: 0.12,
  /** Per point above the threshold, on top of the base fraction. */
  overheatDamagePctPerPoint: 0.03,
  /**
   * And you lose the turn — but you still take it.
   *
   * The first version skipped straight past: no draw, no hand, nothing to look
   * at, and the fight jumped forward while the player was still reading the
   * last thing. Now the turn happens normally and Energy is simply zero, so you
   * see the cards you would have played and have to end the turn holding them.
   * Same cost, entirely legible — and it leaves room for a relic that gives the
   * Energy back rather than one that has to special-case a skipped turn.
   */
  overheatSkipsTurn: true,
  /** At or above this, additionally lose 1 Energy the turn after. */
  criticalAt: 10,
  criticalEnergyLoss: 1,
} as const;

/* ---------- focus ----------
   A stacking buff, not a fourth resource. One stack is spent per card, and the
   stance decides what it becomes: damage in IAI, Block in GUARD.

   It used to bank the whole stack in GUARD and dump all of it into one attack
   in IAI. That read as a number you watched rather than a resource you used —
   it did nothing until the single moment it did everything. Spending one at a
   time makes every card a small decision and makes the stance change a
   redirection rather than a cash-out. */

export const FOCUS_DAMAGE_PER_STACK = 2;
/**
 * Six, not twelve.
 *
 * The cap is also the length of the bar the player reads, and twelve ticks is a
 * row of noise rather than a quantity you can take in at a glance. Six is
 * countable without counting — and a stack you can actually fill is a stack
 * worth deciding when to spend.
 */
export const FOCUS_MAX = 6;

/* ---------- stance ----------
   The multiplying axis. Always exactly one. Cards read differently in each. */

export interface StanceRules {
  readonly id: StanceId;
  readonly name: string;
  /**
   * Plain words, shown on the stance strip. Never make the player remember.
   *
   * Focus is deliberately absent from these. The bar in the resource strip
   * shows the stack and its tooltip says whether this stance banks or spends
   * it, so repeating it here was the same fact in two places — and the strip is
   * for what the stance does to a turn, not for a resource that has its own
   * readout.
   */
  readonly text: string;
  readonly firstAttackBonus: number;
  readonly heatAtTurnEnd: number;
  readonly ventAtTurnEnd: number;
  readonly blockRetained: number;
  readonly extraDraw: number;
  readonly attackPenalty: number;
  /**
   * What a stack of Focus does when this stance spends one.
   *
   * The stance no longer decides *whether* Focus is spent — both spend it, one
   * stack per card. It decides what the stack turns into: damage in IAI, Block
   * in GUARD. That is the axis, and it is now a choice you make every card
   * rather than a lump sum you cash once.
   *
   * The old version banked the whole stack in GUARD and spent all of it on one
   * attack in IAI, which made Focus a number you watched rather than used: it
   * did nothing at all until the single moment it did everything, and until
   * then the readout was a promise rather than a resource.
   */
  readonly focusMode: 'damage' | 'block';
  /** What a stack is worth when it is finally spent. */
  readonly focusPerStack: number;
  /** At or above this Heat, attacks in this stance gain `hotDamage`. */
  readonly hotDamageAtHeat?: number;
  readonly hotDamage?: number;
}

export const STANCES: { readonly [K in StanceId]: StanceRules } = {
  iai: {
    id: 'iai',
    name: 'IAI',
    text: 'Focus adds damage · +2 damage at 5+ Heat · +2 Heat at turn end',
    firstAttackBonus: 0,
    heatAtTurnEnd: 2,
    ventAtTurnEnd: 0,
    blockRetained: 0,
    extraDraw: 0,
    attackPenalty: 0,
    focusMode: 'damage',
    focusPerStack: FOCUS_DAMAGE_PER_STACK,
    // The reward for the Heat IAI charges you. Without it the stance was all
    // cost: 2 a turn, and nothing for living up there.
    hotDamageAtHeat: 5,
    hotDamage: 2,
  },
  guard: {
    id: 'guard',
    name: 'GUARD',
    text: 'Focus adds Block · Vent 1 Heat at turn end · Retain 3 Block',
    firstAttackBonus: 0,
    heatAtTurnEnd: 0,
    ventAtTurnEnd: 1,
    blockRetained: 3,
    extraDraw: 0,
    attackPenalty: 0,
    focusMode: 'block',
    focusPerStack: FOCUS_DAMAGE_PER_STACK,
  },
  flow: {
    id: 'flow',
    name: 'FLOW',
    text: 'Draw +1 each turn · Attacks deal 2 less',
    firstAttackBonus: 0,
    heatAtTurnEnd: 0,
    ventAtTurnEnd: 0,
    blockRetained: 0,
    extraDraw: 1,
    attackPenalty: 2,
    focusMode: 'damage',
    focusPerStack: FOCUS_DAMAGE_PER_STACK,
  },
} as const;

/**
 * The stances actually in rotation.
 *
 * FLOW is defined above but dormant: with a 12-card starting deck and no
 * engine to feed, a third stance is more bookkeeping than decision. Two stances
 * make the transition itself the interesting choice — the axis still
 * recontextualises the hand, with half the surface area to learn.
 *
 * DESIGN.md §1 specs three. Putting FLOW back is this list, and the cards that
 * want a FLOW rider. Nothing else knows the difference: `cycleStance` walks
 * this array, and the content validator rejects any card that names a stance
 * not in it, so dormant content cannot creep back in unnoticed.
 */
export const ACTIVE_STANCES: readonly StanceId[] = ['iai', 'guard'];

export const STARTING_STANCE: StanceId = 'guard';

/* ---------- economy ---------- */

export const ECONOMY = {
  alloyPerCombat: { min: 15, max: 25 },
  alloyPerElite: { min: 45, max: 70 },
  alloyPerBoss: { min: 80, max: 110 },
  /** Rises per purchase, per Slay the Spire's model — it stops you removing your whole deck. */
  cardRemovalBase: 60,
  cardRemovalIncrement: 15,
  /**
   * Patching up is one fixed purchase, not a slider.
   *
   * It used to be 1 Alloy a point, which meant a full heal for 70 — cheaper
   * than a common card, and it made health something you bought back rather
   * than something you spent. A fixed fraction at a fixed price competes with
   * an implant and a card for the same Alloy, which is the decision the Station
   * is supposed to pose. Once per Station, like the forge and the removal.
   */
  repairPct: 0.5,
  repairPrice: 150,
  /** Safe Planet: trade health for Alloy. */
  refuelHullCost: 8,
  refuelAlloyGain: 60,
  safePlanetHealPct: 0.4,
} as const;

/* ---------- the Station ----------
   The shop is where Alloy stops being a score and becomes a decision. Cards,
   a Mastery and a removal all come out of one pool, so every purchase is
   "this, or the thing you were saving for".

   Prices ladder by rarity. The top three tiers are priced so that seeing one is
   an event in itself: you will usually have to give something up for it. */

export const SHOP = {
  cardSlots: 4,
  /**
   * Implants on the shelf. Two, so the choice is a choice and not a catalogue.
   *
   * This is the shelf that turns Alloy into power. Before it, money bought a
   * card, one forge, one removal and a Mastery nobody could afford, so it piled
   * up while the pilot never got faster or hit harder.
   */
  implantSlots: 2,
  /** A card upgrade. Cheaper than a card — it makes what you have better. */
  forgePrice: 75,
  cardPrice: {
    common: 50,
    uncommon: 80,
    rare: 130,
    epic: 190,
    legendary: 260,
    artifact: 340,
  },
} as const;

/* ---------- enemies ----------
   Bands, not values. Individual enemies pick within them. */

export const ENEMY_BANDS = {
  act1: {
    normal: { hp: [20, 45], damage: [6, 12] },
    elite: { hp: [80, 110], damage: [14, 20] },
    boss: { hp: [150, 180], damage: [18, 26] },
  },
  act2: {
    normal: { hp: [45, 80], damage: [12, 20] },
    elite: { hp: [130, 170], damage: [22, 30] },
    boss: { hp: [220, 260], damage: [28, 38] },
  },
  act3: {
    normal: { hp: [70, 120], damage: [18, 28] },
    elite: { hp: [180, 230], damage: [30, 40] },
    boss: { hp: [300, 360], damage: [35, 50] },
  },
} as const;

/* ---------- the map ----------
   A StS-style DAG, generated bottom-up with merging paths. Act 2 is the
   longest and Act 3 the tightest and most dangerous, tuned for the hour
   target. With no saves, a run drifting past 90 minutes is a real problem —
   cut Act 3's length before cutting anything else. */

export const MAP = {
  /** Rows per act, boss included. */
  rows: { 1: 15, 2: 18, 3: 13 },
  /** Width of the lane the paths wander in. */
  columns: 7,
  /**
   * Path walks through the act. They merge and cross on the way up.
   *
   * Nine rather than six: at six the routes converged almost immediately and
   * most rows offered two ways forward, which is a corridor with a kink in it
   * rather than a decision surface.
   */
  paths: 9,
  /**
   * Chance a node also links to a neighbouring column on the next row.
   *
   * The walks alone only branch where two of them happen to diverge, so the map
   * read as a few parallel lines. This weaves them: it is the difference
   * between "which lane am I in" and "which way do I go from here".
   */
  weaveChance: 0.34,
  /** Never let a node fan out past this — a star with five lanes is noise. */
  maxBranchesPerNode: 3,
  /**
   * Lanes out of the origin. Always the same starting point, always a real
   * fan of choices out of it — three is a decision, six is a decision, one is
   * a corridor.
   */
  branches: { min: 3, max: 6 },
  /** No elite, station or safe planet before this row — Act 1 opens plain. */
  earliestSpecialRow: 4,
  /**
   * How many rows back a Safe Planet blocks another one, along real edges.
   *
   * At 1 you could meet two rests with a single node between them and arrive at
   * the second still full, which wastes the choice the node exists for.
   */
  safeSpacing: 2,
  /** The row before the boss is always a Safe Planet. StS's rest-before-boss. */
  restBeforeBoss: true,
  /**
   * One row, about here through the act, is entirely Stations.
   *
   * Stations were ~5% of nodes and every map had one, which sounds fine and is
   * not: a *route* only visits about fifteen nodes, so walking a whole act
   * without a shop on your lane was common. A run reached Act 3 with 1006 Alloy
   * and had never seen one. The same trick as the rest-before-boss — a full row,
   * so every route meets exactly one guaranteed, and rolled Stations are extra.
   */
  stationRowAt: 0.55,
} as const;

/**
 * Node weights, rolled per row on the `map` stream. Combat is the floor the
 * rest sits on; the guarantees in the mapgen invariants override these where
 * they conflict.
 */
export const NODE_WEIGHTS = {
  combat: 30,
  unknown: 26,
  /** Anomalies. Signposted on the map, unlike a `?`. */
  /** Anomalies. Signposted on the map, unlike a `?` — and the most varied
      thing on it, so the map is duller when they are rare. */
  event: 20,
  /** Worth routing to now that an Elite drops a relic and a single-tier offer. */
  elite: 14,
  /**
   * Stations and Safe Planets are where a deck gets *better* rather than
   * bigger — the forge and the two ways to strip a card. At 5 and 4 a player
   * could cross a whole act meeting neither, which is most of why nothing
   * changed between the first fight and the first boss.
   */
  station: 7,
  safe: 6,
} as const;

/** What a `?` turns into, rolled on the `events` stream when entered. */
export const UNKNOWN_WEIGHTS = {
  event: 34,
  combat: 38,
  treasure: 28,
} as const;

/** A derelict found behind a `?`. */
export const TREASURE_ALLOY = { min: 25, max: 45 } as const;

/* ---------- rewards ----------
   Weighted, not uniform, and the weights shift over the run. You are never
   pulling from a flat bag. */

/**
 * Weights per act. The ladder tilts upward as the run goes on, so Act 3
 * genuinely feels different from Act 1 rather than just hitting harder.
 *
 * The top three tiers are deliberately thin. `DESIGN.md` §9 lists reward
 * inflation as a named trap — "you gain so much that Act 3 is trivial" — and a
 * legendary you see every other screen is a common with a better border. These
 * are v0; the simulator moves them.
 */
export const RARITY_WEIGHTS: {
  readonly [act in 1 | 2 | 3]: { readonly [r in Exclude<Rarity, 'basic'>]: number };
} = {
  1: { common: 62, uncommon: 26, rare: 9, epic: 2.4, legendary: 0.5, artifact: 0.1 },
  2: { common: 48, uncommon: 31, rare: 14, epic: 5, legendary: 1.6, artifact: 0.4 },
  3: { common: 36, uncommon: 33, rare: 19, epic: 8.5, legendary: 2.6, artifact: 0.9 },
};

/** Display order and label for a tier. Colour lives in the stylesheet. */
export const RARITY_LABEL: { readonly [r in Rarity]: string } = {
  basic: 'Basic',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  artifact: 'Artifact',
};

/**
 * What beating an act is worth, on top of the relic.
 *
 * A permanent, legible "you are more than you were" — the one progression beat
 * that is not a card and cannot be diluted by deck size. Applied on the way into
 * the next act, so Act 3's boss does not grant it: there is no act after it.
 */
export const BOSS_MAX_HEALTH = 8;

export const REWARDS = {
  cardChoices: 3,
  /** Relics offered at an act finale. You take one. */
  relicChoices: 3,
  /** Skip is always offered. A reward you must take is not a decision. */
  allowSkip: true,
  /** Reward screens with no archetype match before the soft up-weight kicks in. */
  archetypeDroughtBeforeNudge: 3,
  /** Soft, not guaranteed: fewer dead runs, not handing the player their build. */
  archetypeNudgeMultiplier: 1.6,
} as const;

export const ARCHETYPES: readonly Archetype[] = ['iai', 'guard', 'flow', 'overheat', 'neutral'];

/* ---------- masteries ----------
   Rare, run-defining, earned only from Elites and bosses. A mastery makes the
   entire existing deck read differently, so the cap is low on purpose — three
   is already two rewrites of a two-stance game. */

export const MASTERY = {
  /** Chance an Elite drops one, rolled on the `rewards` stream. */
  eliteChance: 0.4,
  cap: 3,
  /**
   * What a Station charges for one.
   *
   * Masteries are shop stock rather than a boss drop: rewriting a stance should
   * be a thing you decide you want, and the price is that it comes out of the
   * same Alloy as the card, the module and the removal.
   */
  price: 170,
  /** Chance a given Station has one on the shelf at all. */
  shopChance: 0.6,
} as const;

/* ---------- the Wavefront ----------
   A pursuing hazard, FTL-style. It is the mechanism that produces the
   "greedy -> threatened" beat at map scale: it puts a price on the detour to
   the shop.

   `DESIGN.md` §3 warns this is the single thing most likely to make the game
   feel oppressive if tuned badly, so it is deliberately generous — it only
   catches a player who takes four detours in an act, and it never blocks a
   route, it just makes the next fight start worse. */

export const WAVEFRONT = {
  /** Act 1 is for learning the stance layer. The front arrives after that. */
  firstAct: 2,
  timePerNode: 1,
  /** A Station or a Safe Planet costs double. That is the whole mechanism. */
  timeAtStop: 2,
  /** Rows of head start. Equal to the number of free detours in an act. */
  grace: 4,
  /** What a fight starts with when the front is on you. */
  hazardHeat: 3,
  hazardEnemyStrength: 1,
} as const;

/* ---------- threads ----------
   Persistent run-scoped flags that resolve within the same run. */

export const THREADS = {
  maxActive: 4,
  /** Content test asserts the pool stays near this, so it cannot drift punitive. */
  toneMix: { positive: 0.3, mixed: 0.4, costly: 0.3 },
  toneMixTolerance: 0.1,
} as const;

/* ---------- hook priorities ----------
   Lower runs first. Named bands rather than bare numbers, so a new module
   author picks a band instead of guessing an integer and colliding. */

export const HOOK_PRIORITY = {
  /** Environments set the terms of the fight before anything else reacts. */
  environment: 100,
  /** Masteries rewrite a stance, so they land before the things that read it. */
  mastery: 200,
  /** Ship modules: the default band. */
  module: 300,
  /** Statuses tick after the things that applied them. */
  status: 400,
  /** Threads observe; they should see the settled state. */
  thread: 500,
} as const;

/* ---------- scope discipline ---------- */

export const SCOPE = {
  /** Depth comes from stance and heat recontextualising a small vocabulary. */
  keywordCap: 14,
  targets: { cards: 85, enemies: 28, elites: 9, bosses: 3, events: 35, environments: 8 },
} as const;

/* ---------- run length and win rate ----------
   With no saves, run length is a hard constraint rather than a preference.
   The simulator reports against these. */

export const TARGETS = {
  runMinutes: { min: 45, max: 70, hardCeiling: 90 },
  winRateDepth0: { min: 0.4, max: 0.55 },
  winRateDepthMax: { min: 0.1, max: 0.2 },
  /** Below 8% a card is not in the game; above 60% it is mandatory. */
  pickRateBand: { min: 0.08, max: 0.6 },
} as const;

/* ---------- depth ----------
   A title-screen setting, 0-20, chosen before the run. Each Depth adds one
   rule, never just +HP — higher difficulty asks a new question.
   Depths 1-5 come from DESIGN.md §7. The rest land at M7; they are `null`
   here rather than invented, and the title screen says so. */

export interface DepthRule {
  readonly depth: number;
  readonly text: string | null;
}

/**
 * The ladder stops at 5, and that is the whole ladder.
 *
 * It ran to 20 with rules 6-20 unwritten, which meant the slider offered
 * fifteen difficulty levels that played exactly like Depth 5. A difficulty
 * setting that does nothing is worse than one that is not offered: the player
 * picks 12, dies, and learns nothing about what 12 was supposed to mean.
 *
 * Each Depth adds a rule rather than a stat bump — DESIGN.md §7 — so extending
 * this is five more ideas, not five more multipliers. Raising the cap is this
 * constant plus the entries to go with it.
 */
export const MAX_DEPTH = 5;

export const DEPTH_RULES: readonly DepthRule[] = [
  { depth: 1, text: 'Elites are harder.' },
  { depth: 2, text: 'Shops cost more.' },
  { depth: 3, text: 'Fewer Safe Planets.' },
  { depth: 4, text: 'Overheat threshold drops to 7.' },
  { depth: 5, text: 'Bosses gain a second phase.' },
];