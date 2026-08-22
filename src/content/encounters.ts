/* Encounters — which enemies show up together, per act and tier.
 *
 * An encounter is an addressable thing with an id rather than an ad-hoc list
 * of enemies chosen at the node, because mapgen has to assert that no two
 * consecutive combats use the identical one.
 *
 * Act 1 node 1 is always a normal combat in Clear Space, and every Act 1 normal
 * qualifies. Elite and boss rosters exist from M5, so the fallback in mapgen
 * that pointed elites at the normal pool is now dead weight rather than the
 * thing holding the map together.
 */

import type { EncounterId, EnemyId } from '../engine/types.ts';
import { TRAINING_HULK, TUTORIAL_ENCOUNTER_ID } from './tutorial.ts';
import {
  CINDER_WISP,
  KILN_ADEPT,
  LATHE_DRONE,
  RUST_TICK,
  SCRAP_HOUND,
  SLAG_WARDEN,
} from './enemies/act1.ts';
import { KILN_ALPHA, KILN_SOVEREIGN, MAG_LATHE } from './enemies/act1elites.ts';
import {
  ARC_WELDER,
  ASH_CHOIR,
  IRON_PROCESSION,
  BLOOM_WEEVIL,
  SABLE_DRIFTER,
  SIPHON_ENGINE,
  SPLINT_CHORUS,
  TALLY_KEEPER,
  VOID_RONIN,
  WAVEFRONT_HERALD,
} from './enemies/act2.ts';
import {
  CHIRALITY_WARDEN,
  COLLAPSE_CHOIR,
  EVENT_HORIZON,
  HEAT_SIPHON,
  CANTOR_OF_ASH,
  MIRROR_RONIN,
  NULLWRIGHT,
  NULL_PRISM,
  RIMEWAKE,
  TESSELLATE_SHARD,
} from './enemies/act3.ts';

export interface EncounterDef {
  readonly id: EncounterId;
  readonly name: string;
  readonly act: 1 | 2 | 3;
  readonly tier: 'normal' | 'elite' | 'boss';
  readonly enemyIds: readonly EnemyId[];
  /**
   * Earliest row this may be placed on. Absent means anywhere.
   *
   * The three-wide Act 1 packs need it. A Swarm on the arrival node is three
   * enemies against the opening twelve cards, before a single reward screen —
   * which is not a hard start, it is a different game. The board can be wide
   * once the deck has had a chance to answer it.
   */
  readonly minRow?: number;
  /**
   * Never placed on a chart. The introduction's fight only.
   *
   * Same shape as `EventDef.pinnedOnly`: content that is reachable by name and
   * by nothing else. Without it a training target with sixty health and no
   * teeth would turn up in Act 1 as a free node.
   */
  readonly tutorial?: boolean;
}

export const ENCOUNTERS: readonly EncounterDef[] = [
  {
    // The introduction. `tutorial` keeps it out of `encountersFor`, which is
    // the only thing mapgen ever asks.
    id: TUTORIAL_ENCOUNTER_ID,
    name: 'Derelict Hauler',
    act: 1,
    tier: 'normal',
    tutorial: true,
    enemyIds: [TRAINING_HULK],
  },

  /* ---------- Act 1 ---------- */
  {
    id: 'hound_pair',
    name: 'Pack',
    act: 1,
    tier: 'normal',
    enemyIds: [SCRAP_HOUND, SCRAP_HOUND],
  },
  {
    id: 'hound_and_wisp',
    name: 'Scavengers',
    act: 1,
    tier: 'normal',
    enemyIds: [SCRAP_HOUND, CINDER_WISP],
  },
  {
    /* Two, the smallest two in the game. It was one Drone alone, on the
       argument that the opening fight should teach the loop without also
       asking who to kill first — and the introduction does that job now, with
       a hulk that does not fight back. A normal fight is a board, and a board
       is at least two things. */
    id: 'lone_drone',
    name: 'Stray',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE, CINDER_WISP],
  },
  {
    /* The clock and the wall. Burrow makes the Tick slow to kill, and the
       rust runs the whole time you are trying. */
    id: 'tick_nest',
    name: 'Nest',
    act: 1,
    tier: 'normal',
    enemyIds: [RUST_TICK, SCRAP_HOUND],
  },
  {
    /* Target priority, stated plainly: the Adept gets worse every turn you
       spend on the Wisp, and the Wisp is Scalding you the whole time. */
    id: 'kindling',
    name: 'Kindling',
    act: 1,
    tier: 'normal',
    enemyIds: [KILN_ADEPT, CINDER_WISP],
  },
  {
    id: 'lathe_watch',
    name: 'Maintenance Loop',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE, CINDER_WISP],
  },
  {
    id: 'alpha_den',
    name: 'The Den',
    act: 1,
    tier: 'elite',
    enemyIds: [KILN_ALPHA],
  },
  {
    id: 'lathe_warden',
    name: 'Tolerance',
    act: 1,
    tier: 'elite',
    enemyIds: [MAG_LATHE, CINDER_WISP],
  },
  {
    id: 'the_kiln',
    name: 'The Kiln',
    act: 1,
    tier: 'boss',
    enemyIds: [KILN_SOVEREIGN],
  },

  /* ---------- Act 2 ---------- */
  {
    id: 'drift_pair',
    name: 'Drifters',
    act: 2,
    tier: 'normal',
    enemyIds: [SABLE_DRIFTER, SABLE_DRIFTER],
  },
  {
    id: 'welder_and_choir',
    name: 'Salvage Crew',
    act: 2,
    tier: 'normal',
    enemyIds: [ARC_WELDER, ASH_CHOIR],
  },
  {
    /* A duel with a second. The Ronin still decides the fight — the Wisp is
       there so the board is a board. */
    id: 'ronin_duel',
    name: 'A Rival School',
    act: 2,
    tier: 'normal',
    enemyIds: [VOID_RONIN, SABLE_DRIFTER],
  },
  {
    id: 'choir_and_drifter',
    name: 'The Wake',
    act: 2,
    tier: 'normal',
    enemyIds: [ASH_CHOIR, SABLE_DRIFTER],
  },
  {
    /* The clock and the spike together: the Weevil cannot be blocked away and
       the Drifter's Crest has to be. You do not have turns for both. */
    id: 'bloom_and_drift',
    name: 'Bloom',
    act: 2,
    tier: 'normal',
    enemyIds: [BLOOM_WEEVIL, SABLE_DRIFTER],
  },
  {
    id: 'the_procession',
    name: 'The Procession',
    act: 2,
    tier: 'elite',
    enemyIds: [IRON_PROCESSION],
  },
  {
    id: 'siphon_run',
    name: 'The Siphon',
    act: 2,
    tier: 'elite',
    enemyIds: [SIPHON_ENGINE, ASH_CHOIR],
  },
  {
    id: 'the_herald',
    name: 'The Herald',
    act: 2,
    tier: 'boss',
    enemyIds: [WAVEFRONT_HERALD],
  },

  /* ---------- Act 3 ----------
     Every normal encounter here counters an archetype, and the player can see
     which one is ahead of them on the map. Routing is the answer, not a perfect
     deck. */
  {
    id: 'chirality_watch',
    name: 'Chirality',
    act: 3,
    tier: 'normal',
    enemyIds: [CHIRALITY_WARDEN, HEAT_SIPHON],
  },
  {
    id: 'prism_pair',
    name: 'Refraction',
    act: 3,
    tier: 'normal',
    enemyIds: [NULL_PRISM, CHIRALITY_WARDEN],
  },
  {
    id: 'the_swarm',
    name: 'Tessellation',
    act: 3,
    tier: 'normal',
    enemyIds: [TESSELLATE_SHARD, TESSELLATE_SHARD, TESSELLATE_SHARD],
  },
  {
    id: 'siphon_and_prism',
    name: 'The Draw',
    act: 3,
    tier: 'normal',
    enemyIds: [HEAT_SIPHON, NULL_PRISM],
  },
  {
    /* Rimewake grows while the Shard blocks for it. Every turn spent on the
       wall is a turn the timer gains three Strength -- and the Scald means
       turtling through it walks you into an overheat instead. */
    id: 'rimewake_screen',
    name: 'Screen',
    act: 3,
    tier: 'normal',
    enemyIds: [RIMEWAKE, TESSELLATE_SHARD],
  },
  {
    id: 'the_mirror',
    name: 'The Mirror',
    act: 3,
    tier: 'elite',
    enemyIds: [MIRROR_RONIN],
  },
  {
    id: 'the_last_choir',
    name: 'The Last Choir',
    act: 3,
    tier: 'elite',
    enemyIds: [COLLAPSE_CHOIR, TESSELLATE_SHARD],
  },
  {
    id: 'the_horizon',
    name: 'The Event Horizon',
    act: 3,
    tier: 'boss',
    enemyIds: [EVENT_HORIZON],
  },

  /* ---- the second batch ----

     Two things this pool did not have. **Three of anything before Act 3** — the
     board was two enemies for two whole acts, so "who do I hit first" had one
     shape and the AoE cards had nothing to be for. And **a pack whose members
     answer different questions**: a pair of the same enemy is one problem
     twice, and a pair that both punish being hit is still one problem.

     Three-wide is only tolerable now because the deck can answer it: the
     starting twelve carry an AoE from node one, and the pool has five more
     above it. Adding these before that existed would have been adding a
     difficulty spike and calling it variety. */

  {
    /* Act 1's only three-wide, and deliberately the softest three in the game:
       two Wisps and a Hound is less total health than the Pack, so it teaches
       the shape of a wide board before anything punishes reading it slowly. */
    id: 'wisp_swarm',
    name: 'Swarm',
    act: 1,
    tier: 'normal',
    minRow: 5,
    enemyIds: [CINDER_WISP, CINDER_WISP, SCRAP_HOUND],
  },
  {
    /* The Adept scales and the Drone does not, in front of a Tick that is
       running a clock through both. Kill order is the entire fight. */
    id: 'kiln_work_crew',
    name: 'Work Crew',
    act: 1,
    tier: 'normal',
    minRow: 5,
    enemyIds: [KILN_ADEPT, LATHE_DRONE, RUST_TICK],
  },
  {
    id: 'drifter_escort',
    name: 'Escort',
    act: 2,
    tier: 'normal',
    enemyIds: [SABLE_DRIFTER, ARC_WELDER, BLOOM_WEEVIL],
  },
  {
    /* Three questions at once: the Choir wants you slow, the Siphon wants you
       rich, and the Ronin wants you in the wrong stance.

       Renamed off `the_procession`, which the elite above already owned.
       `startCombat` resolves an encounter with `ENCOUNTERS.find(id)` and the
       elite is listed first, so a normal node that rolled THIS pack opened the
       Iron Procession instead — an elite enemy, alone, on a normal node, paying
       normal rewards. Nothing threw and nothing looked wrong except the fight.
       There is a test for duplicate ids now. */
    id: 'the_long_column',
    name: 'The Long Column',
    act: 2,
    tier: 'normal',
    enemyIds: [ASH_CHOIR, SIPHON_ENGINE, VOID_RONIN],
  },
  {
    id: 'welder_pair',
    name: 'Cutting Crew',
    act: 2,
    tier: 'normal',
    enemyIds: [ARC_WELDER, ARC_WELDER],
  },
  {
    /* The things that arrive ahead of the front, not the front itself.
    
       This held the actual Act 2 boss, at its full 182 hull, on a NORMAL node
       paying normal rewards — 244 total against an act average of 125, and it
       meant you could meet the Herald before you met the Herald. The validator
       refuses a boss in a normal encounter now. */
    id: 'herald_and_weevil',
    name: 'Forerunners',
    act: 2,
    tier: 'normal',
    enemyIds: [ASH_CHOIR, BLOOM_WEEVIL],
  },
  {
    id: 'prism_field',
    name: 'Prism Field',
    act: 3,
    tier: 'normal',
    enemyIds: [NULL_PRISM, TESSELLATE_SHARD, HEAT_SIPHON],
  },
  {
    id: 'the_cold_wake',
    name: 'The Cold Wake',
    act: 3,
    tier: 'normal',
    enemyIds: [RIMEWAKE, CHIRALITY_WARDEN],
  },

  /* ---- seating the second batch of enemies ----
     An enemy nothing puts on the board is an enemy that does not exist. Each of
     these exists to make one of the new five the *point* of the fight rather
     than a body next to the real threat. */

  {
    /* The Warden is the point of the fight; the Wisp is the reason you cannot
       simply take your time over it. */
    id: 'warden_post',
    name: 'The Post',
    act: 1,
    tier: 'normal',
    enemyIds: [SLAG_WARDEN, CINDER_WISP],
  },
  {
    /* The Warden will not let you wait and the Wisp punishes you for hurrying.
       Two clocks pulling opposite ways. */
    id: 'warden_and_wisp',
    name: 'Checkpoint',
    act: 1,
    tier: 'normal',
    enemyIds: [SLAG_WARDEN, CINDER_WISP],
  },
  {
    /* Kill order stated as a bill: every turn the Keeper lives costs Alloy, and
       the Drifter is the thing that will kill you if you look away from it. */
    id: 'the_levy',
    name: 'The Levy',
    act: 2,
    tier: 'normal',
    enemyIds: [TALLY_KEEPER, SABLE_DRIFTER],
  },
  {
    id: 'braced_line',
    name: 'Braced Line',
    act: 2,
    tier: 'normal',
    enemyIds: [SPLINT_CHORUS, ARC_WELDER, VOID_RONIN],
  },
  {
    id: 'the_counting_house',
    name: 'The Counting House',
    act: 2,
    tier: 'normal',
    enemyIds: [TALLY_KEEPER, SPLINT_CHORUS],
  },
  {
    id: 'unwritten',
    name: 'Unwritten',
    act: 3,
    tier: 'normal',
    enemyIds: [NULLWRIGHT, NULL_PRISM],
  },
  {
    id: 'the_cantor',
    name: 'The Cantor',
    act: 3,
    tier: 'elite',
    enemyIds: [CANTOR_OF_ASH],
  },
];

export function encountersFor(
  act: 1 | 2 | 3,
  tier: 'normal' | 'elite' | 'boss',
  row?: number,
): readonly EncounterDef[] {
  return ENCOUNTERS.filter(
    (entry) =>
      entry.tutorial !== true &&
      entry.act === act &&
      entry.tier === tier &&
      (row === undefined || entry.minRow === undefined || row >= entry.minRow),
  );
}
