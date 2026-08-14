/* Encounters — which enemies show up together, per act and tier.
 *
 * Mapgen asserts that no two consecutive combats use the identical encounter,
 * so an encounter is an addressable thing with an id rather than an ad-hoc
 * list of enemies chosen at the node.
 *
 * Arrives at M1 for the vertical slice, and fills out at M5.
 */

import type { EncounterId, EnemyId } from '../engine/types.ts';

export interface EncounterDef {
  readonly id: EncounterId;
  readonly act: 1 | 2 | 3;
  readonly tier: 'normal' | 'elite' | 'boss';
  readonly enemyIds: readonly EnemyId[];
}

export const ENCOUNTERS: readonly EncounterDef[] = [];
