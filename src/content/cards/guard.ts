/* GUARD cards — receive, then answer.
 *
 * GUARD vents Heat and keeps 3 Block across the turn, so these cards trade
 * tempo for staying power and blunt what is coming rather than racing it.
 */

import type { CardDef } from '../../engine/types.ts';
import { WEAK } from '../statuses.ts';

export const GUARD_CARDS: readonly CardDef[] = [
  {
    id: 'bulwark',
    name: 'Bulwark',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 8 }],
    upgrade: { name: 'Bulwark+', effects: [{ op: 'block', amount: 11 }] },
    flavor: 'Plate salvaged off something that did not survive needing it.',
  },

  {
    id: 'deflection_field',
    name: 'Deflection Field',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 5 }],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' }],
    },
    upgrade: { name: 'Deflection Field+', effects: [{ op: 'block', amount: 8 }] },
    flavor: 'Not a wall. A suggestion, made forcefully, about where things should go.',
  },

  {
    id: 'iron_wake',
    name: 'Iron Wake',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 2,
    effects: [
      { op: 'block', amount: 12 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Iron Wake+',
      effects: [
        { op: 'block', amount: 16 },
        { op: 'ventHeat', amount: 3 },
      ],
    },
    flavor: 'Drift, and let the hull do the arguing.',
  },

  {
    id: 'counterweight',
    name: 'Counterweight',
    type: 'attack',
    rarity: 'rare',
    archetype: 'guard',
    cost: 1,
    effects: [
      {
        op: 'scaleWith',
        source: 'blockGainedThisTurn',
        per: 3,
        then: [{ op: 'damage', amount: 2, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Counterweight+',
      effects: [
        {
          op: 'scaleWith',
          source: 'blockGainedThisTurn',
          per: 3,
          then: [{ op: 'damage', amount: 3, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Everything you put in front of you is also something to swing.',
  },

  {
    id: 'standing_wave',
    name: 'Standing Wave',
    type: 'skill',
    rarity: 'epic',
    archetype: 'guard',
    cost: 2,
    exhaust: true,
    effects: [{ op: 'block', amount: 10 }],
    stanceRider: {
      stance: 'guard',
      effects: [
        { op: 'block', amount: 10 },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'allEnemies' },
      ],
    },
    upgrade: { name: 'Standing Wave+', effects: [{ op: 'block', amount: 15 }] },
    flavor: 'Hold the position long enough and the position starts holding you.',
  },
];
