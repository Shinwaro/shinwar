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
import { WEAK } from '../statuses.ts';

export const IAI_SLASH = 'iai_slash';
export const SOLAR_PARRY = 'solar_parry';
export const VECTOR_STEP = 'vector_step';
export const SEVER = 'sever';

export const BASIC_CARDS: readonly CardDef[] = [
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
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'damage', amount: 4, target: 'enemy' }],
    },
    upgrade: {
      name: 'IAI Slash+',
      effects: [{ op: 'damage', amount: 9, target: 'enemy' }],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
    },
    flavor: 'The cut is finished before the blade is seen to move.',
  },

  {
    id: SOLAR_PARRY,
    name: 'Solar Parry',
    type: 'skill',
    rarity: 'basic',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 6 }],
    stanceRider: {
      stance: 'guard',
      effects: [
        { op: 'block', amount: 3 },
        { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
      ],
    },
    upgrade: {
      name: 'Solar Parry+',
      effects: [{ op: 'block', amount: 9 }],
      stanceRider: {
        stance: 'guard',
        effects: [
          { op: 'block', amount: 3 },
          { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
        ],
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

/** 5 / 4 / 2 / 1, per DESIGN.md §8. Twelve cards, no engine. */
export const STARTING_DECK: readonly string[] = [
  IAI_SLASH,
  IAI_SLASH,
  IAI_SLASH,
  IAI_SLASH,
  IAI_SLASH,
  SOLAR_PARRY,
  SOLAR_PARRY,
  SOLAR_PARRY,
  SOLAR_PARRY,
  VECTOR_STEP,
  VECTOR_STEP,
  SEVER,
];
