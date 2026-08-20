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
import { CINDER_WISP, KILN_ADEPT, LATHE_DRONE, RUST_TICK, SCRAP_HOUND } from './enemies/act1.ts';
import { KILN_ALPHA, KILN_SOVEREIGN, MAG_LATHE } from './enemies/act1elites.ts';
import {
  ARC_WELDER,
  ASH_CHOIR,
  IRON_PROCESSION,
  BLOOM_WEEVIL,
  SABLE_DRIFTER,
  SIPHON_ENGINE,
  VOID_RONIN,
  WAVEFRONT_HERALD,
} from './enemies/act2.ts';
import {
  CHIRALITY_WARDEN,
  COLLAPSE_CHOIR,
  EVENT_HORIZON,
  HEAT_SIPHON,
  MIRROR_RONIN,
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
}

export const ENCOUNTERS: readonly EncounterDef[] = [
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
    /* One alone. The opening fight should teach the loop -- block the spike,
       hit on the quiet turns -- without also asking who to kill first. */
    id: 'lone_drone',
    name: 'Stray',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE],
  },
  {
    /* The clock and the wall. Burrow makes the Tick slow to kill, and the
       poison runs the whole time you are trying. */
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
    id: 'ronin_duel',
    name: 'A Rival School',
    act: 2,
    tier: 'normal',
    enemyIds: [VOID_RONIN],
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
];

export function encountersFor(act: 1 | 2 | 3, tier: 'normal' | 'elite' | 'boss'): readonly EncounterDef[] {
  return ENCOUNTERS.filter((entry) => entry.act === act && entry.tier === tier);
}
