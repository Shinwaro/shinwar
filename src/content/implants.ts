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
    rarity: 'mythic',
    price: 400,
    maxStacks: 1,
    passive: { energyPerTurn: 1 },
    flavor: 'The sect rated this core for eleven years of service. You have other plans.',
  },
  {
    id: 'wide_aperture_rig',
    name: 'Aperture Rig',
    rarity: 'legendary',
    price: 260,
    maxStacks: 1,
    passive: { drawPerTurn: 1 },
    flavor: 'You see one more thing coming. It is astonishing how much that is.',
  },
  /* Two more epics, because a boss offers three of them and there was one.
  
     Each takes a different lever, so the boss screen is a real choice rather
     than three sizes of the same idea: one is the turn's size, one is the
     turn's ceiling, one is what every hit is worth. */
  {
    id: 'pressure_bank',
    name: 'Pressure Bank',
    rarity: 'legendary',
    price: 260,
    maxStacks: 1,
    /* A vent and some plate, and no change to the line.
    
       It used to raise the overheat threshold as well, which made it a third
       thing on one implant and put it in competition with the two relics whose
       whole job is that line. Two Heat off the top and two health back is a
       different offer: it pays out over a long fight rather than buying room
       for a bigger turn. */
    /* The mend became Block.

       Two health a turn is the most boring number an epic can pay: it is
       invisible while it works, it does nothing on the turn you actually need
       something, and it is worth nothing at all in a fight you win in four
       turns. Two Block is the same size and lands where the decision is — it
       stacks on top of what GUARD retains, and it is two damage you no longer
       have to spend Energy answering. */
    passive: { ventPerTurn: 2, blockPerTurn: 2 },
    flavor: 'It holds what the reactor cannot, and gives it back slower.',
  },
  {
    id: 'long_edge',
    name: 'The Long Edge',
    rarity: 'legendary',
    price: 260,
    maxStacks: 1,
    /* Honed Edge's lever, at the tier above, and it does not stack — the reason
       to take it is that it is more than two Honed Edges could be by the boss.

       Two on EVERY hit rather than four on the first. On a single-swing card
       that is a downgrade and on anything that hits twice or more it is a
       straight upgrade, which is the whole point: the top of the damage shelf
       should ask what kind of deck you are building rather than simply being
       the bigger number. */
    passive: { damageEveryHit: 2 },
    flavor: 'Ground down over eleven years to exactly the length it wanted to be.',
  },
  {
    id: 'honed_edge',
    name: 'Honed Edge',
    rarity: 'epic',
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
    /* Swapped with Opening Stance. A Focus every turn compounds across a long
       fight; two at the start of one does not, and pricing them the other way
       round had the cheaper common be the strictly better buy in every fight
       past turn three. */
    id: 'breath_governor',
    name: 'Breath Governor',
    rarity: 'uncommon',
    price: 125,
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
    /* Up 20. A degree of overheat room is worth more than the sticker said: it
       is not "more Heat capacity", it is one extra turn of every card that
       gains Heat, in a deck built to gain Heat. */
    price: 160,
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
    rarity: 'epic',
    price: 190,
    maxStacks: 2,
    /* Two, not one. A single point per stack was a rounding error next to what
       an epic implant costs: Focus is spent one stack at a time, so +1 was one
       extra damage on the card you happened to be holding. At 2 it doubles what
       a stack is worth, which is a reason to build around banking them. */
    passive: { focusPerStackBonus: 2 },
    flavor: 'Patience, made mechanically worth more.',
  },
  {
    id: 'opening_stance',
    name: 'Opening Stance',
    rarity: 'common',
    price: 95,
    maxStacks: 2,
    passive: { startingFocus: 2 },
    flavor: 'You arrive already halfway into the cut.',
  },

  /* ---------- reading the hull ----------
     Same gate as the relics, and here it does something implants otherwise
     cannot: an implant is a thing you AIM at with saved Alloy, so a threshold
     implant is a purchase you make because of how the run has gone rather than
     in spite of it. */

  {
    id: 'bulwark_lattice',
    name: 'Bulwark Lattice',
    rarity: 'epic',
    price: 200,
    maxStacks: 2,
    passive: { whenHullBelowPct: 40, blockPerTurn: 6 },
    flavor: 'It only unfolds when the readings say it has to. It is never wrong.',
  },

  {
    id: 'vigil_plating',
    name: 'Vigil Plating',
    /* The high-side one, and the only implant that asks you to stay clean.
       Priced as an epic because 3 off every attack is enormous — but it is the
       first thing to switch off when the act goes badly, which is exactly the
       turn you wanted it most. */
    rarity: 'legendary',
    price: 250,
    maxStacks: 1,
    passive: { whenHullAbovePct: 50, damageTakenFlat: 3 },
    flavor: 'Reactive plate. It reads your vitals and it is not sentimental.',
  },

  /* Suture Weave was here: a common that healed 1 a turn, stacking to 3.
     Removed, and with The Long Watch's mend gone with it there is now nothing
     in the game that heals on a timer. That is the point — health is the
     resource the whole run is about, and a trickle that repairs it for free
     turns every fight into a question of whether you can outlast the tick
     rather than whether you can win it. Healing comes from Anomalies, Safe
     Planets and Stations now, where it is a decision with a price. */

];
