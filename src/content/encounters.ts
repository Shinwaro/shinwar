/* Encounters — which enemies show up together, per act and tier.
 *
 * An encounter is an addressable thing with an id rather than an ad-hoc list
 * of enemies chosen at the node, because mapgen has to assert that no two
 * consecutive combats use the identical one.
 *
 * Three Act 1 openers at M1. Act 1 node 1 is always a normal combat in Clear
 * Space, and all three qualify.
 */

import type { EncounterId, EnemyId } from '../engine/types.ts';
import { CINDER_WISP, LATHE_DRONE, SCRAP_HOUND } from './enemies/act1.ts';

export interface EncounterDef {
  readonly id: EncounterId;
  readonly name: string;
  readonly act: 1 | 2 | 3;
  readonly tier: 'normal' | 'elite' | 'boss';
  readonly enemyIds: readonly EnemyId[];
}

export const ENCOUNTERS: readonly EncounterDef[] = [
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
    id: 'lathe_watch',
    name: 'Maintenance Loop',
    act: 1,
    tier: 'normal',
    enemyIds: [LATHE_DRONE, CINDER_WISP],
  },
];

export function encountersFor(act: 1 | 2 | 3, tier: 'normal' | 'elite' | 'boss'): readonly EncounterDef[] {
  return ENCOUNTERS.filter((entry) => entry.act === act && entry.tier === tier);
}
