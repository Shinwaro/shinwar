/* Statuses. Data, not code.
 *
 * Nothing here is special-cased in the damage pipeline — each status is a row
 * that feeds one named step. That is what keeps the keyword count honest:
 * a new status is a row, not a branch, so the cost of adding one is visible.
 *
 * Target is <= 14 keywords at 1.0. Counting the ones that need explaining:
 * Block, Heat, Focus, Vulnerable, Weak, Strength, Exhaust, Innate, Irradiate,
 * Rust, Scald. Eleven.
 *
 * Rust and Scald exist because every enemy was asking the same question --
 * "can you out-damage this" -- and the answer was always the same shape. A
 * rust is a clock you cannot block, and a Scald pushes you toward an overheat
 * you were managing fine. Both make the fight a different problem rather than a
 * bigger one.
 */

import type { StatusDef } from '../engine/types.ts';

export const VULNERABLE = 'vulnerable';
export const WEAK = 'weak';
export const STRENGTH = 'strength';
export const IRRADIATE = 'irradiate';
export const RUST = 'rust';
export const SCALD = 'scald';

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
    text: 'Attacks deal 1 more damage per stack.',
    kind: 'buff',
    decay: 'never',
    damageDealtFlat: 1,
  },
  /* Irradiate feeds no pipeline field — it is a counter the Radiation Belt
     reads and turns into unblockable damage. Kept as a status rather than a
     bespoke number so it shows up wherever statuses already show up. */
  {
    id: IRRADIATE,
    name: 'Irradiate',
    text: 'Takes 1 damage per stack at the start of each turn.',
    kind: 'debuff',
    decay: 'never',
  },
  /* A clock you cannot Block. Blocking is the answer to almost everything else
     in this game, so the interesting version of pressure is the kind that walks
     past it — and it falls off, so it is a reason to hurry rather than a tax. */
  {
    id: RUST,
    name: 'Rust',
    text: 'Takes 1 damage per stack at the start of its turn. Ignores Block.',
    kind: 'debuff',
    decay: 'turn',
    damagePerTurn: 1,
  },
  /* Pushes you up the gauge you were managing. Against a deck that never went
     near the overheat line this is nothing; against one riding it, it is the
     whole fight. */
  {
    id: SCALD,
    name: 'Scald',
    text: 'Gain 1 Heat per stack at the start of your turn.',
    kind: 'debuff',
    decay: 'never',
    heatPerTurn: 1,
  },
];
