/* Relics — the progression the run was missing.
 *
 * Cards make the deck better at what it already does. Relics change what the
 * deck is *allowed* to do, and they are the only thing in the game that raises
 * Energy or draw — which is why a run without them felt like standing still no
 * matter how many cards you picked up.
 *
 * One per act finale, chosen from three. That is the shape the reward should
 * have had all along: an act ending should hand you a decision about what the
 * rest of the run is, not a thing that happened to you.
 *
 * Every relic here is declared rather than hooked. A hook cannot change a
 * number the engine is about to produce, only react after it has, and every
 * field on `RelicPassive` modifies something the turn loop or the damage
 * pipeline is already computing. A relic that needs to act *at a moment* would
 * register a handler as well — its id is a hook source like anything else.
 *
 * The tiering rule: a relic that adds Energy is worth more than anything else
 * on this list, because Energy multiplies the whole deck rather than adding to
 * it. Those are priced and rolled accordingly.
 */

import type { RelicDef } from '../engine/types.ts';

export const RELICS: readonly RelicDef[] = [
  /* ---- the yardsticks ---- */
  {
    id: 'ballast_weave',
    name: 'Ballast Weave',
    text: 'Start each turn with 3 Block.',
    rarity: 'uncommon',
    passive: { blockPerTurn: 3 },
    flavor: 'Sect underlayer. Wears through in a season and saves you twice a fight.',
  },
  {
    id: 'whetted_edge',
    name: 'Whetted Edge',
    text: 'Every attack deals 2 more.',
    rarity: 'rare',
    passive: { damageFlat: 2 },
    flavor: 'Nothing clever. A better edge, kept better.',
  },
  {
    id: 'ceramic_underplate',
    name: 'Ceramic Underplate',
    text: 'Every attack that reaches you deals 2 less.',
    rarity: 'uncommon',
    passive: { damageTakenFlat: 2 },
    flavor: 'It cracks instead of you. Once per crack.',
  },
  {
    id: 'breath_marker',
    name: 'Breath Marker',
    text: 'Gain 1 Focus at the start of each turn.',
    rarity: 'common',
    passive: { focusPerTurn: 1 },
    flavor: 'A bead on a cord. You move it without deciding to.',
  },
  {
    id: 'bleed_valve',
    name: 'Bleed Valve',
    text: 'Vent 1 Heat at the start of each turn.',
    rarity: 'common',
    passive: { ventPerTurn: 1 },
    flavor: 'Runs constantly. Sounds like something is wrong. Nothing is.',
  },
  {
    id: 'sect_bracer',
    name: 'Sect Bracer',
    text: 'Gain 12 max health.',
    rarity: 'common',
    passive: { maxHealth: 12 },
    flavor: 'Fitted to an arm that is not yours. Close enough.',
  },

  /* ---- the rule-changers ---- */
  {
    id: 'wide_aperture',
    name: 'Wide Aperture',
    text: 'Draw 1 more card each turn.',
    rarity: 'epic',
    passive: { drawPerTurn: 1 },
    flavor: 'You were always seeing this much. Now you are looking at it.',
  },
  {
    id: 'heat_shroud',
    name: 'Heat Shroud',
    text: 'The overheat threshold rises by 2.',
    rarity: 'uncommon',
    passive: { overheatThreshold: 2 },
    flavor: 'It does not cool anything. It moves the line you are not allowed to cross.',
  },
  {
    id: 'drawn_string',
    name: 'Drawn String',
    text: 'Each stack of Focus is worth 1 more when it is spent.',
    rarity: 'rare',
    passive: { focusPerStackBonus: 1 },
    flavor: 'Wound tighter than it should be. That is the entire technique.',
  },
  {
    id: 'coldforge_lining',
    name: 'Coldforge Lining',
    text: 'Every attack deals 3 more and every attack that reaches you deals 1 less.',
    rarity: 'epic',
    passive: { damageFlat: 3, damageTakenFlat: 1 },
    flavor: 'Forged in a shadow. The sect argued about whether that mattered.',
  },

  /* ---- the run-definers ----
     Energy multiplies the whole deck rather than adding to it, so these are the
     rarest things in the pool and the reason a boss is worth reaching. */
  {
    id: 'second_reactor',
    name: 'Second Reactor',
    text: 'Gain 1 Energy each turn.',
    rarity: 'legendary',
    passive: { energyPerTurn: 1 },
    flavor: 'The cutter was built for one. Somebody disagreed, at length, with a torch.',
  },
  {
    id: 'the_long_sight',
    name: 'The Long Sight',
    text: 'Gain 1 Energy and draw 1 more card each turn, but every attack that reaches you deals 2 more.',
    rarity: 'legendary',
    passive: { energyPerTurn: 1, drawPerTurn: 1, damageTakenFlat: -2 },
    flavor: 'You see all of it coming. Seeing is not the same as moving.',
  },
  {
    id: 'the_unmoved_centre',
    name: 'The Unmoved Centre',
    text: 'Start each fight with 4 Focus, gain 1 Focus a turn, and each stack is worth 1 more.',
    rarity: 'artifact',
    passive: { startingFocus: 4, focusPerTurn: 1, focusPerStackBonus: 1 },
    flavor: 'The last thing the sect agreed on, and the only one that survived them.',
  },
];
