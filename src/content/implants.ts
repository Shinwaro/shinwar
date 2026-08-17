/* Implants — the upgrades you buy.
 *
 * Relics are found; implants are aimed at. That distinction is the whole reason
 * both exist. Before these, Alloy converted into a card, one forge, one removal
 * and a Mastery nobody could afford, so it piled up in a corner while the pilot
 * stayed exactly as fast and exactly as hard-hitting as they started. A run
 * ended with a deck that had doubled in size and a character that had not moved.
 *
 * The three at the top are run-definers and capped at one each: an Energy, a
 * card, and damage on every attack. They change how many cards a turn you get to
 * play and what each one is worth — which is the thing a bigger deck cannot do,
 * because a bigger deck is mostly dilution.
 *
 * The rest stack. Two Honed Edges is +4 on every attack you make for the rest of
 * the run, and choosing that over one Reactor Tuning is a build.
 *
 * Rules text is GENERATED from `passive` by `describeImplant()`. Do not write it
 * here — a hand-written line drifts from the number the moment either moves, and
 * the whole point of an implant is that you can trust what it says it does.
 */

import type { ImplantDef } from '../engine/types.ts';

export const IMPLANTS: readonly ImplantDef[] = [
  /* ---------- the run-definers ----------
     Priced so that seeing one is an event and buying it costs you the two other
     things you were going to buy. One each per run. */
  {
    id: 'reactor_tuning',
    name: 'Reactor Tuning',
    rarity: 'legendary',
    price: 320,
    maxStacks: 1,
    passive: { energyPerTurn: 1 },
    flavor: 'The sect rated this core for eleven years of service. You have other plans.',
  },
  {
    id: 'wide_aperture_rig',
    name: 'Aperture Rig',
    rarity: 'epic',
    price: 260,
    maxStacks: 1,
    passive: { drawPerTurn: 1 },
    flavor: 'You see one more thing coming. It is astonishing how much that is.',
  },
  {
    id: 'honed_edge',
    name: 'Honed Edge',
    rarity: 'rare',
    price: 170,
    maxStacks: 3,
    passive: { damageFlat: 2 },
    flavor: 'Sharpened past the point the manual describes, and then again.',
  },

  /* ---------- the stackable middle ----------
     Cheap enough to buy two, small enough that two is a choice rather than an
     obligation. This is where an Act 1 pile of Alloy goes. */
  {
    id: 'underplate',
    name: 'Underplate',
    rarity: 'common',
    price: 90,
    maxStacks: 3,
    passive: { damageTakenFlat: 1 },
    flavor: 'A second skin, bolted to the first.',
  },
  {
    id: 'ballast_ring',
    name: 'Ballast Ring',
    rarity: 'uncommon',
    price: 120,
    maxStacks: 3,
    passive: { blockPerTurn: 2 },
    flavor: 'Weight where the weight should be.',
  },
  {
    id: 'breath_governor',
    name: 'Breath Governor',
    rarity: 'uncommon',
    price: 130,
    maxStacks: 2,
    passive: { focusPerTurn: 1 },
    flavor: 'It counts for you, so you do not have to.',
  },
  {
    id: 'coolant_shunt',
    name: 'Coolant Shunt',
    rarity: 'common',
    price: 85,
    maxStacks: 3,
    passive: { ventPerTurn: 1 },
    flavor: 'Runs hot into the dark and hopes the dark is big enough.',
  },
  {
    id: 'thermal_ward',
    name: 'Thermal Ward',
    rarity: 'uncommon',
    price: 140,
    maxStacks: 2,
    passive: { overheatThreshold: 1 },
    flavor: 'One more degree of room, bought at some expense.',
  },
  {
    id: 'sect_weave',
    name: 'Sect Weave',
    rarity: 'common',
    price: 100,
    maxStacks: 4,
    passive: { maxHealth: 10 },
    flavor: 'Woven under the ribs by people who expected you to need it.',
  },
  {
    id: 'drawn_wire',
    name: 'Drawn Wire',
    rarity: 'rare',
    price: 190,
    maxStacks: 2,
    passive: { focusPerStackBonus: 1 },
    flavor: 'Patience, made mechanically worth more.',
  },
  {
    id: 'opening_stance',
    name: 'Opening Stance',
    rarity: 'uncommon',
    price: 125,
    maxStacks: 2,
    passive: { startingFocus: 2 },
    flavor: 'You arrive already halfway into the cut.',
  },
];
