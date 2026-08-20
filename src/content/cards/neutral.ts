/* Neutral cards — the ones that work in any deck.
 *
 * Deliberately the least exciting file in the pool. Neutrals are the glue that
 * stops a run dying because the rewards never offered your archetype; the
 * interesting cards live in the archetype files.
 *
 * The two top-tier cards live here because they are not for any one build.
 */

import type { CardDef } from '../../engine/types.ts';
import { STRENGTH, VULNERABLE } from '../statuses.ts';

export const NEUTRAL_CARDS: readonly CardDef[] = [
  {
    id: 'hairline',
    name: 'Hairline',
    type: 'attack',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    effects: [{ op: 'damage', amount: 4, target: 'enemy' }],
    upgrade: { name: 'Hairline+', effects: [{ op: 'damage', amount: 6, target: 'enemy' }] },
    flavor: 'Not a wound. A place for the next one to start.',
  },

  {
    id: 'recalibrate',
    name: 'Recalibrate',
    type: 'skill',
    rarity: 'common',
    archetype: 'neutral',
    cost: 1,
    effects: [{ op: 'draw', amount: 2 }],
    upgrade: { name: 'Recalibrate+', cost: 0, effects: [{ op: 'draw', amount: 2 }] },
    flavor: 'Half of piloting is admitting the last reading was wrong.',
  },

  {
    id: 'pressure_cut',
    name: 'Pressure Cut',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    // 5, not 7. Vulnerable is worth more than a flat number on the same card —
    // it multiplies everything that follows it this turn — so the attack it
    // rides on should not also be the best 1-cost attack in the pool.
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
    ],
    upgrade: {
      name: 'Pressure Cut+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
      ],
    },
    flavor: 'Open the seam. The vacuum finishes the argument.',
  },

  {
    id: 'overdraw',
    name: 'Overdraw',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'draw', amount: 3 },
      { op: 'discard', amount: 1, random: true },
    ],
    upgrade: {
      name: 'Overdraw+',
      effects: [
        { op: 'draw', amount: 4 },
        { op: 'discard', amount: 1, random: true },
      ],
    },
    flavor: 'Take everything off the rack and sort it out mid-fall.',
  },

  {
    id: 'momentum',
    name: 'Momentum',
    type: 'attack',
    rarity: 'rare',
    archetype: 'neutral',
    cost: 1,
    effects: [
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 1,
        then: [{ op: 'damage', amount: 3, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Momentum+',
      effects: [
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 1,
          then: [{ op: 'damage', amount: 4, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Nothing in vacuum stops on its own. Including you.',
  },

  {
    id: 'starfall',
    name: 'Starfall',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'damage', amount: 12, target: 'allEnemies' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'allEnemies' },
      { op: 'gainHeat', amount: 3 },
    ],
    upgrade: {
      name: 'Starfall+',
      effects: [
        { op: 'damage', amount: 16, target: 'allEnemies' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'allEnemies' },
        { op: 'gainHeat', amount: 3 },
      ],
    },
    flavor: 'The sect had one of these. The sect used it once.',
  },

  {
    id: 'the_dead_sect',
    name: 'The Dead Sect',
    type: 'skill',
    rarity: 'artifact',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
      { op: 'draw', amount: 2 },
      { op: 'ventHeat', amount: 4 },
    ],
    upgrade: {
      name: 'The Dead Sect+',
      effects: [
        { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        { op: 'draw', amount: 2 },
        { op: 'ventHeat', amount: 4 },
      ],
    },
    flavor: 'Every name you were taught, spoken once, in order, to nobody.',
  },
];
