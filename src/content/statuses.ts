/* Statuses. Data, not code.
 *
 * Nothing here is special-cased in the damage pipeline — each status is a row
 * that feeds one named step. That is what keeps the keyword count honest:
 * a new status is a row, not a branch, so the cost of adding one is visible.
 *
 * Target is <= 14 keywords at 1.0. Counting the ones that need explaining:
 * Block, Heat, Focus, Vulnerable, Weak, Strength, Exhaust, Innate, Irradiate,
 * Rust, Scald, Tempered, Overclock. Thirteen — one under, and the last one
 * should be spent very deliberately.
 *
 * Tempered and Overclock exist because Strength was the ONLY lasting buff in
 * the game, so every "power" card was the same card with a different number.
 * Neither needed new machinery worth the name: Tempered is the existing
 * `damageTakenMult` pointed the other way, capped by the same `multFloor` that
 * caps Weak.
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
export const TEMPERED = 'tempered';
export const OVERCLOCK = 'overclock';

export const STATUSES: readonly StatusDef[] = [
  /* Capped at double, which is two stacks. Same argument as Weak on the other
     side of the pipeline: stacks compound, so an uncapped 1.5 reaches 5.06 at
     four stacks and the correct play against anything with real health becomes
     "stack Vulnerable, then hit it once". The cap sits in the data next to the
     number it caps. */
  {
    id: VULNERABLE,
    name: 'Vulnerable',
    text: 'Takes 50% more damage per stack, to a maximum of 100% more. One stack falls off at the end of its turn.',
    kind: 'debuff',
    decay: 'turn',
    damageTakenMult: 1.5,
    multFloor: 2,
  },
  /* Capped at half. Stacks compound, so an uncapped 0.75 hits 0.32 at four
     stacks — at which point Weak stops being a tempo play and becomes the
     entire answer to a fight, and stacking it is strictly better than doing
     anything else. The cap is in the data next to the number it caps. */
  {
    id: WEAK,
    name: 'Weak',
    text: 'Deals 25% less damage per stack, to a maximum of 50% less. One stack falls off at the end of its turn.',
    kind: 'debuff',
    decay: 'turn',
    damageDealtMult: 0.75,
    multFloor: 0.5,
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
  /* The mirror of Weak, and capped for the same reason. Reuses
     `damageTakenMult` and `multFloor` exactly as Weak and Vulnerable do, so it
     is a row rather than a branch. */
  {
    id: TEMPERED,
    name: 'Tempered',
    text: 'Takes 25% less damage per stack, to a maximum of 50% less. One stack falls off at the end of your turn.',
    kind: 'buff',
    decay: 'turn',
    damageTakenMult: 0.75,
    multFloor: 0.5,
  },
  /* The expensive one. Stacks are turns, not Energy — see `energyWhileHeld`.
     The only status in the game that changes how many cards a turn you get to
     play, which is why it is priced like a relic rather than like a buff. */
  {
    id: OVERCLOCK,
    name: 'Overclock',
    text: 'Gain 1 extra Energy at the start of your turn. One stack falls off at the end of your turn, so the stacks are how many turns it lasts.',
    kind: 'buff',
    decay: 'turn',
    energyWhileHeld: 1,
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
