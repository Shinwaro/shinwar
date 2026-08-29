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
    text: 'Takes 25% more damage per stack, to a maximum of 50% more. One stack falls off at the end of its turn.',
    kind: 'debuff',
    decay: 'turn',
    /* 25% a stack, capped at half again — down from 50% and double.
     *
     * At 1.5 it was the strongest line in the game and it was not close: two
     * stacks doubled a turn, so any deck that could reach the cap stopped
     * caring what its cards did and only cared about the order it played them
     * in. Mirroring Weak's numbers puts the two debuffs on the same scale, and
     * the symmetry is worth having on its own — one is what you do to them, one
     * is what they do to you, and a player who has learned one now knows the
     * other. */
    damageTakenMult: 1.25,
    multFloor: 1.5,
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
     reads and turns into damage. Kept as a status rather than a bespoke number
     so it shows up wherever statuses already show up.

     Block stops it, unlike Rust. Two unblockable clocks was one too many: Rust
     is the one that walks past armour, which is the whole of what makes it
     frightening, and a second source doing the same thing made Block feel
     optional in exactly the act where the numbers get big. Irradiate is a fee
     for taking your time, and armour is a fair answer to it. */
  {
    id: IRRADIATE,
    name: 'Irradiate',
    text: 'Takes 1 damage per stack at the start of each turn. Block stops it.',
    kind: 'debuff',
    decay: 'never',
  },
  /* A clock you cannot Block. Blocking is the answer to almost everything else
     in this game, so the interesting version of pressure is the kind that walks
     past it — and it falls off, so it is a reason to hurry rather than a tax. */
  {
    id: RUST,
    name: 'Rust',
    text: 'Takes 2 damage per stack at the end of its turn, then loses a stack. Ignores Block.',
    kind: 'debuff',
    decay: 'turn',
    /* The END of the turn, and the stack goes with the bite.
     *
     * At the start it was a bill for a turn you had not taken yet, and the
     * stack then hung around a further round before falling off somewhere else
     * — so the number on the board and the number you were about to take never
     * agreed. Charged for the turn you just took, and paid off in the same
     * beat, it is a cost you can actually count. */
    tickAt: 'turnEnd',
    /* 1 was not worth a card. Rust costs a whole play to apply, decays a stack
       a turn, and pays out at the START of the target's turn — so a single
       stack landed for 1 and was gone. At 2 the trade is a real one: it beats
       plain damage on anything you will be fighting for more than a turn, and
       it still walks past Block, which is the reason to reach for it. */
    damagePerTurn: 2,
  },
  /* The mirror of Weak, and capped for the same reason. Reuses
     `damageTakenMult` and `multFloor` exactly as Weak and Vulnerable do, so it
     is a row rather than a branch. */
  {
    id: TEMPERED,
    name: 'Tempered',
    text: 'Every attack against you deals 1 less per stack.',
    kind: 'buff',
    /* It stays, and it is flat.
     *
     * As a decaying multiplier it was a worse Block: it lasted one turn, it
     * scaled with what was already hitting you, and the card that granted it
     * was competing with cards that granted Block on the same turn for the same
     * Energy. Nothing was ever built around it because there was nothing to
     * build — the stacks were gone before a second card could add to them.
     *
     * Permanent and flat makes it the other half of the defensive game from
     * Block: Block is a wall you rebuild every turn and Tempered is armour you
     * accumulate, worth most against the many-small-hits packs that Block
     * handles worst and least against the one big swing Block handles best. */
    decay: 'never',
    damageTakenFlat: 1,
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
  /* Scald never decays, which is the point of it and was also the whole
     problem: in a long fight it stacked into a second overheat clock with no
     counterplay at all. A vent worth the name sheds a stack now — the same
     resource the status attacks, so answering it costs you the cards you would
     rather have spent on damage. */
  {
    id: SCALD,
    name: 'Scald',
    text: 'Gain 1 Heat per stack at the start of your turn. Venting 2 or more Heat at once sheds a stack.',
    kind: 'debuff',
    decay: 'never',
    heatPerTurn: 1,
    shedOnVent: 2,
  },
];
