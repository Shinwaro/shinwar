/* The starting deck. Four cards, twelve copies.
 *
 * Deliberately mediocre — Act 1's "weak" beat is manufactured by this deck
 * having no engine in it. Every one of them still teaches something: IAI Slash
 * teaches the stance rider, Solar Parry teaches that GUARD counter-punches,
 * Vector Step teaches that the transition costs a card slot, and Sever teaches
 * that your best card is the one cooking you.
 *
 * Rules text is NOT written here. `describeCard()` generates it from the ops
 * below. Flavor is the only hand-written string on a card.
 */

import type { CardDef } from '../../engine/types.ts';
import { JETTISON } from './discard.ts';
import { WEAK } from '../statuses.ts';

export const IAI_SLASH = 'iai_slash';
export const SOLAR_PARRY = 'solar_parry';
export const VECTOR_STEP = 'vector_step';
export const SEVER = 'sever';
export const FANNED_CUT = 'fanned_cut';

/* The basic answer to more than one thing.
   Deliberately small and deliberately hot: it exists so a pack fight has a
   shape other than picking a target, not so it out-damages a real attack. */
export const FANNED_CUT_DEF: CardDef = {
  id: FANNED_CUT,
  name: 'Fanned Cut',
  type: 'attack',
  rarity: 'basic',
  archetype: 'neutral',
  cost: 1,
  effects: [
    { op: 'damage', amount: 4, target: 'allEnemies' },
    { op: 'gainHeat', amount: 1 },
  ],
  upgrade: {
    name: 'Fanned Cut+',
    effects: [
      { op: 'damage', amount: 6, target: 'allEnemies' },
      { op: 'gainHeat', amount: 1 },
    ],
  },
  flavor: 'One motion, several answers.',
};

export const BASIC_CARDS: readonly CardDef[] = [
  FANNED_CUT_DEF,
  {
    id: IAI_SLASH,
    name: 'IAI Slash',
    type: 'attack',
    rarity: 'basic',
    archetype: 'iai',
    cost: 1,
    effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
    // No Focus rider. IAI is where the stack is SPENT, so a card that hands one
    // back on the same swing was quietly refunding the stance's own cost.
    // 2, not 4. The rider is meant to tilt the stance decision, not to be most
    // of the card's damage — at 4 the basic attack was a 10 whenever you stood
    // in the stance the deck already wanted to stand in.
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'damage', amount: 2, target: 'enemy' }],
    },
    upgrade: {
      name: 'IAI Slash+',
      effects: [{ op: 'damage', amount: 9, target: 'enemy' }],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'damage', amount: 3, target: 'enemy' }],
      },
    },
    flavor: 'The cut is finished before the blade is seen to move.',
  },

  {
    id: SOLAR_PARRY,
    name: 'Solar Shield',
    type: 'skill',
    rarity: 'basic',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 6 }],
    // GUARD adds the debuff, not more Block. Stacking block-on-block made the
    // stance the only place this card was worth playing, which is a rider
    // deciding the stance rather than the stance colouring the card.
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' }],
    },
    upgrade: {
      name: 'Solar Shield+',
      effects: [{ op: 'block', amount: 9 }],
      stanceRider: {
        stance: 'guard',
        effects: [{ op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' }],
      },
    },
    flavor: 'Receive. Do not resist. The star does not notice you either way.',
  },

  {
    id: VECTOR_STEP,
    name: 'Vector Step',
    type: 'skill',
    rarity: 'basic',
    // Neutral while FLOW is dormant: it is the transition card for whatever
    // stances happen to be in rotation, not a card for one of them.
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'draw', amount: 1 },
    ],
    upgrade: {
      name: 'Vector Step+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'draw', amount: 2 },
      ],
    },
    flavor: 'Burn once, drift forever. The cutter remembers every heading it has ever held.',
  },

  {
    id: SEVER,
    name: 'Sever',
    type: 'attack',
    rarity: 'basic',
    archetype: 'overheat',
    cost: 2,
    effects: [
      { op: 'damage', amount: 14, target: 'enemy' },
      { op: 'gainHeat', amount: 3 },
    ],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'ventHeat', amount: 2 }],
    },
    upgrade: {
      name: 'Sever+',
      effects: [
        { op: 'damage', amount: 18, target: 'enemy' },
        { op: 'gainHeat', amount: 3 },
      ],
    },
    flavor: 'Everything the reactor has, spent in one line. It has to go somewhere.',
  },
];

/**
 * 5 / 4 / 2 / 1, per DESIGN.md §8, plus one.
 *
 * Thirteen now. The extra is Jettison, and it is the one card here that is not
 * a thing you do to the fight — it is a thing you do to your own hand. The
 * opening deck could draw five cards that did not combine and offer no answer
 * but ending the turn, which is the complaint the whole discard file exists to
 * fix; leaving the fix entirely in the reward pool meant a new player met the
 * problem long before they could ever meet the answer.
 *
 * One copy, at 1 Energy, so it is a card you have rather than a plan you run.
 */
export const STARTING_DECK: readonly string[] = [
  IAI_SLASH,
  IAI_SLASH,
  IAI_SLASH,
  IAI_SLASH,
  // One of the five IAI Slashes is this instead. The opening deck had no answer
  // at all to two enemies, so the first pack fight was five single-target
  // swings against two health bars — and "hit the same one twice" is not a
  // decision. It costs Heat, so the answer is not free.
  FANNED_CUT,
  SOLAR_PARRY,
  SOLAR_PARRY,
  SOLAR_PARRY,
  SOLAR_PARRY,
  VECTOR_STEP,
  VECTOR_STEP,
  SEVER,
  JETTISON,
];
