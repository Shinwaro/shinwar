/* Cards you can only be given.
 *
 * Every card in here is the payoff of one specific Anomaly or Thread, and is
 * marked `exclusive` so it never turns up in a reward screen or a shop. A card
 * that is the whole point of a decision stops being one the moment you can just
 * buy it two nodes later.
 */

import type { CardDef } from '../../engine/types.ts';
import { VULNERABLE } from '../statuses.ts';

export const EVENT_CARDS: readonly CardDef[] = [
  {
    id: 'vareth_chitin_edge',
    name: 'Vareth Chitin Edge',
    type: 'attack',
    rarity: 'rare',
    archetype: 'guard',
    cost: 1,
    exclusive: true,
    effects: [
      { op: 'damage', amount: 8, target: 'enemy' },
      { op: 'block', amount: 4 },
    ],
    upgrade: {
      name: 'Vareth Chitin Edge+',
      effects: [
        { op: 'damage', amount: 10, target: 'enemy' },
        { op: 'block', amount: 6 },
      ],
    },
    flavor: 'It was going to be armour. It is a very good knife instead.',
  },

  {
    id: 'vareth_hatchling',
    name: 'Vareth Hatchling',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    // Innate: it is there at the start of every fight, the way a companion is.
    // The closest the deck can get to an ally without an ally system.
    innate: true,
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      { op: 'block', amount: 3 },
    ],
    upgrade: {
      name: 'Vareth Hatchling+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        { op: 'block', amount: 5 },
      ],
    },
    flavor: 'It has decided you are the shape a parent is.',
  },

  {
    id: 'dead_reckoning',
    name: 'Dead Reckoning',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    effects: [
      { op: 'draw', amount: 2 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Dead Reckoning+',
      effects: [
        { op: 'draw', amount: 3 },
        { op: 'ventHeat', amount: 2 },
      ],
    },
    flavor: 'No beacons, no chart. Speed, heading, and the nerve to trust both.',
  },

  {
    id: 'syndicate_mark',
    name: 'Syndicate Mark',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    exclusive: true,
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
    ],
    upgrade: {
      name: 'Syndicate Mark+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 3, target: 'enemy' },
      ],
    },
    flavor: 'They paint the ones they intend to come back for.',
  },
];
