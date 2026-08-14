/* Statuses. Data, not code.
 *
 * Nothing here is special-cased in the damage pipeline — each status is a row
 * that feeds one named step. That is what keeps the keyword count honest:
 * a new status is a row, not a branch, so the cost of adding one is visible.
 *
 * Target is <= 14 keywords at 1.0. Counting the ones that need explaining:
 * Block, Heat, Focus, Vulnerable, Weak, Strength, Exhaust, Innate. Eight.
 */

import type { StatusDef } from '../engine/types.ts';

export const VULNERABLE = 'vulnerable';
export const WEAK = 'weak';
export const STRENGTH = 'strength';

export const STATUSES: readonly StatusDef[] = [
  {
    id: VULNERABLE,
    name: 'Vulnerable',
    text: 'Takes 50% more damage. One stack falls off at the end of its turn.',
    kind: 'debuff',
    decay: 'turn',
    damageTakenMult: 1.5,
  },
  {
    id: WEAK,
    name: 'Weak',
    text: 'Deals 25% less damage. One stack falls off at the end of its turn.',
    kind: 'debuff',
    decay: 'turn',
    damageDealtMult: 0.75,
  },
  {
    id: STRENGTH,
    name: 'Strength',
    text: 'Attacks deal 1 more damage per stack. Does not decay.',
    kind: 'buff',
    decay: 'never',
    damageDealtFlat: 1,
  },
];
