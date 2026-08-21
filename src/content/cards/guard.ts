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
    /* 8, matching Bulwark's common yardstick, with the GUARD rider as the
       whole of the tier difference. It was 11 to escape being a strictly worse
       common; the rider does that job on its own, and 11 made this the only
       defensive card worth drawing. */
    effects: [{ op: 'block', amount: 8 }],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' }],
    },
    upgrade: { name: 'Deflection Field+', effects: [{ op: 'block', amount: 11 }] },
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
    // An epic that costs 2 and exhausts was giving 10 Block -- two less than the
    // uncommon Iron Wake, and gone afterwards. It has to be a wall or it has no
    // reason to be in the deck at all.
    effects: [{ op: 'block', amount: 24 }],
    stanceRider: {
      stance: 'guard',
      effects: [
        { op: 'block', amount: 10 },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'allEnemies' },
      ],
    },
    upgrade: { name: 'Standing Wave+', effects: [{ op: 'block', amount: 32 }] },
    flavor: 'Hold the position long enough and the position starts holding you.',
  },
];
