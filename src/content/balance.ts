/* Every tuning number in the game, in one file, so it can be moved without
 * touching logic. Nothing here is a constant of nature — these are v0 values
 * from DESIGN.md §8 and the build prompt §5, and the simulator moves them.
 *
 * `BALANCE.md` (M6) explains why each one is what it is. Until then the
 * comments here carry the reasoning.
 */

import type { Archetype, Rarity, SlotId, StanceId } from '../engine/types.ts';

/* ---------- the player ---------- */

export const PLAYER = {
  maxHull: 70,
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

export const STARTING_STANCE: StanceId = 'guard';

/* ---------- focus ----------
   A stacking buff consumed by the next attack, not a fourth resource. */

export const FOCUS_DAMAGE_PER_STACK = 2;

/* ---------- the ship ----------
   Power is the ship's equivalent of deck size: it prevents pure accumulation
   and turns "I found a great module" into a real decision. */

export const SHIP = {
  startingPowerCapacity: 8,
  /** A finished run should land here — enough that you had to choose. */
  targetEndPowerCapacity: { min: 12, max: 16 },
  targetEndModules: { min: 5, max: 7 },
} as const;

export const SLOTS: readonly SlotId[] = ['reactor', 'hull', 'drive', 'sensors', 'weapons', 'cargo'];

/* ---------- economy ---------- */

export const ECONOMY = {
  alloyPerCombat: { min: 15, max: 25 },
  alloyPerElite: { min: 45, max: 70 },
  alloyPerBoss: { min: 80, max: 110 },
  /** Rises per purchase, per Slay the Spire's model — it stops you removing your whole deck. */
  cardRemovalBase: 60,
  cardRemovalIncrement: 15,
  hullRepairPerPoint: 1,
  modulePrice: { common: 90, uncommon: 140, rare: 210 },
  reactorCellBase: 180,
  reactorCellPower: 2,
  /** Safe Planet: trade hull for Alloy. */
  refuelHullCost: 8,
  refuelAlloyGain: 60,
  safePlanetHealPct: 0.3,
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

/* ---------- rewards ----------
   Weighted, not uniform, and the weights shift over the run. You are never
   pulling from a flat bag. */

export const RARITY_WEIGHTS: {
  readonly [act in 1 | 2 | 3]: { readonly [r in Exclude<Rarity, 'basic'>]: number };
} = {
  1: { common: 70, uncommon: 25, rare: 5 },
  2: { common: 60, uncommon: 32, rare: 8 },
  3: { common: 50, uncommon: 38, rare: 12 },
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
