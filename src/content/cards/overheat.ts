/* OVERHEAT cards — build to build.
 *
 * The archetype that reads the pressure gauge as a resource instead of a
 * threat. Every one of these is better the closer you are to the thing that
 * kills you, which is the whole design in one archetype: your best cards
 * actively build toward your death.
 */

import type { CardDef } from '../../engine/types.ts';

export const OVERHEAT_CARDS: readonly CardDef[] = [
  {
    id: 'purge_cycle',
    name: 'Purge Cycle',
    type: 'skill',
    rarity: 'common',
    archetype: 'overheat',
    cost: 0,
    effects: [{ op: 'ventHeat', amount: 3 }],
    upgrade: { name: 'Purge Cycle+', effects: [{ op: 'ventHeat', amount: 5 }] },
    flavor: 'Open every port and let the dark have it.',
  },

  {
    id: 'reactor_lance',
    name: 'Reactor Lance',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 2,
        then: [{ op: 'damage', amount: 2, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Reactor Lance+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 2,
          then: [{ op: 'damage', amount: 2, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Point the problem at somebody else.',
  },

  {
    id: 'criticality',
    name: 'Criticality',
    type: 'attack',
    rarity: 'rare',
    archetype: 'overheat',
    cost: 2,
    effects: [
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'damage', amount: 24, target: 'enemy' }],
        else: [{ op: 'damage', amount: 10, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Criticality+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 6 },
          then: [{ op: 'damage', amount: 30, target: 'enemy' }],
          else: [{ op: 'damage', amount: 13, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Two turns of restraint, spent in one.',
  },

  {
    id: 'runaway_bloom',
    name: 'Runaway Bloom',
    type: 'attack',
    rarity: 'epic',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 8, target: 'allEnemies' },
      { op: 'gainHeat', amount: 3 },
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 8 },
        then: [{ op: 'damage', amount: 10, target: 'allEnemies' }],
      },
    ],
    upgrade: {
      name: 'Runaway Bloom+',
      effects: [
        { op: 'damage', amount: 10, target: 'allEnemies' },
        { op: 'gainHeat', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 8 },
          then: [{ op: 'damage', amount: 13, target: 'allEnemies' }],
        },
      ],
    },
    flavor: 'The cutter was never rated for this. Neither were you.',
  },
];
