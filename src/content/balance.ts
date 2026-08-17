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
  max: 10,
  /** At end of player turn, at or above this: take damage and burn a card. */
  overheatAt: 8,
  /** Damage taken is `(heat - overheatDamageOffset) * overheatDamagePerPoint`. */
  overheatDamageOffset: 7,
  overheatDamagePerPoint: 3,
  /** At or above this, additionally lose 1 Energy next turn. */
  criticalAt: 10,
  criticalEnergyLoss: 1,
} as const;

/* ---------- stance ----------
   The multiplying axis. Always exactly one. Cards read differently in each. */

export interface StanceRules {
  readonly id: StanceId;
  readonly name: string;
  /** Plain words, shown on the stance strip. Never make the player remember. */
  readonly text: string;
  readonly firstAttackBonus: number;
  readonly heatAtTurnEnd: number;
  readonly ventAtTurnEnd: number;
  readonly blockRetained: number;
  readonly extraDraw: number;
  readonly attackPenalty: number;
}

export const STANCES: { readonly [K in StanceId]: StanceRules } = {
  iai: {
    id: 'iai',
    name: 'IAI',
    text: 'First attack each turn +4 · +1 Heat at turn end',
    firstAttackBonus: 4,
    heatAtTurnEnd: 1,
    ventAtTurnEnd: 0,
    blockRetained: 0,
    extraDraw: 0,
    attackPenalty: 0,
  },
  guard: {
    id: 'guard',
    name: 'GUARD',
    text: 'Vent 2 Heat at turn end · Retain 3 Block',
    firstAttackBonus: 0,
    heatAtTurnEnd: 0,
    ventAtTurnEnd: 2,
    blockRetained: 3,
    extraDraw: 0,
    attackPenalty: 0,
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

/* ---------- focus ----------
   A stacking buff consumed by the next attack, not a fourth resource. */

export const FOCUS_DAMAGE_PER_STACK = 2;

/* ---------- the ship ----------
   Power is the ship's equivalent of deck size: it prevents pure accumulation
   and turns "I found a great module" into a real decision. */

export const SHIP = {
  /**
   * The cutter's own pool, spent in space combat. Placeholder: it has never
   * been played, and the real number waits on the grid system. Repairable with
   * Alloy, unlike the ronin.
   */
  startingHull: 70,
  /** Grid size in cells. Growing it is the ship path's equivalent of a card slot. */
  gridW: 5,
  gridH: 3,
  targetEndGrid: { w: 7, h: 4 },
  /** A finished run should land here — enough that you had to choose. */
  targetEndModules: { min: 5, max: 7 },
} as const;


/* ---------- ship combat ----------
   Autoresolve numbers. Heat carries between turns and is the thing that
   punishes a greedy build; Energy resets so every turn is a fresh decision. */

export const SHIP_COMBAT = {
  maxHeat: 12,
  /** At or above this at the end of a turn, the reactor cooks the hull. */
  overheatAt: 10,
  overheatDamage: 6,
  overchargeDamage: 5,
  overchargeHeat: 3,
  ventAmount: 5,
  divertEnergy: 3,
  braceShield: 8,
} as const;

/* ---------- crashing ----------
   You always survive; the escalation is in what you lose. */

export const CRASH = {
  /** Fraction of max hull the cutter is left with. */
  hullLeftPct: 0.1,
  roninDamage: { min: 8, max: 16 },
  modulesKnockedLoose: 1,
  repairBase: 70,
  repairIncrement: 50,
  /** Surface fights while stranded roll from this tier instead of normal. */
  strandedTier: 'elite',
} as const;

/* ---------- economy ---------- */

export const ECONOMY = {
  alloyPerCombat: { min: 15, max: 25 },
  alloyPerElite: { min: 45, max: 70 },
  alloyPerBoss: { min: 80, max: 110 },
  /** Rises per purchase, per Slay the Spire's model — it stops you removing your whole deck. */
  cardRemovalBase: 60,
  cardRemovalIncrement: 15,
  hullRepairPerPoint: 1,
  /** Station: patch the cutter, not the ronin. */
  shipRepairPerPoint: 1,
  /** Safe Planet: trade hull for Alloy. */
  refuelHullCost: 8,
  refuelAlloyGain: 60,
  safePlanetHealPct: 0.3,
} as const;

/* ---------- the Station ----------
   The shop is where Alloy stops being a score and becomes a decision. It
   stocks both paths — cards for the pilot, modules for the ship — out of the
   one pool, so every purchase is "pilot or ship, now or later".

   Prices ladder by rarity. The top three tiers are priced so that seeing one is
   an event in itself: you will usually have to give something up for it. */

export const SHOP = {
  cardSlots: 4,
  moduleSlots: 2,
  cardPrice: {
    common: 50,
    uncommon: 80,
    rare: 130,
    epic: 190,
    legendary: 260,
    artifact: 340,
  },
  modulePrice: {
    common: 90,
    uncommon: 140,
    rare: 210,
    epic: 300,
    legendary: 400,
    artifact: 520,
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
  /** Path walks through the act. They merge and cross on the way up. */
  paths: 6,
  /**
   * Lanes out of the origin. Always the same starting point, always a real
   * fan of choices out of it — three is a decision, six is a decision, one is
   * a corridor.
   */
  branches: { min: 3, max: 6 },
  /** No elite, station or safe planet before this row — Act 1 opens plain. */
  earliestSpecialRow: 4,
  /** The row before the boss is always a Safe Planet. StS's rest-before-boss. */
  restBeforeBoss: true,
} as const;

/**
 * Node weights, rolled per row on the `map` stream. Combat is the floor the
 * rest sits on; the guarantees in the mapgen invariants override these where
 * they conflict.
 */
export const NODE_WEIGHTS = {
  combat: 42,
  unknown: 26,
  /** Anomalies. Signposted on the map, unlike a `?`. */
  event: 15,
  elite: 8,
  station: 5,
  safe: 4,
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

export const REWARDS = {
  cardChoices: 3,
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
  /** A boss always does. */
  bossGuaranteed: true,
  cap: 3,
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
  targets: { cards: 85, modules: 30, enemies: 28, elites: 9, bosses: 3, events: 35, environments: 8 },
} as const;

/* ---------- run length and win rate ----------
   With no saves, run length is a hard constraint rather than a preference.
   The simulator reports against these. */

export const TARGETS = {
  runMinutes: { min: 45, max: 70, hardCeiling: 90 },
  winRateDepth0: { min: 0.4, max: 0.55 },
  winRateDepth20: { min: 0.1, max: 0.2 },
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

export const MAX_DEPTH = 20;

export const DEPTH_RULES: readonly DepthRule[] = [
  { depth: 1, text: 'Elites are harder.' },
  { depth: 2, text: 'Shops cost more.' },
  { depth: 3, text: 'Fewer Safe Planets.' },
  { depth: 4, text: 'Overheat threshold drops to 7.' },
  { depth: 5, text: 'Bosses gain a second phase.' },
  { depth: 6, text: null },
  { depth: 7, text: null },
  { depth: 8, text: null },
  { depth: 9, text: null },
  { depth: 10, text: null },
  { depth: 11, text: null },
  { depth: 12, text: null },
  { depth: 13, text: null },
  { depth: 14, text: null },
  { depth: 15, text: null },
  { depth: 16, text: null },
  { depth: 17, text: null },
  { depth: 18, text: null },
  { depth: 19, text: null },
  { depth: 20, text: null },
];
