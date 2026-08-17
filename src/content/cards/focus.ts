/* Focus cards — the bank and the draw.
 *
 * Focus only *spends* in a stance that spends it: GUARD banks the stack, IAI
 * cashes it. So the archetype is a rhythm rather than a number — hold in GUARD
 * while the stack climbs and the Heat falls, then change stance and spend the
 * whole thing on one swing, knowing every turn you stay in IAI is 2 more Heat.
 *
 * These are the cards that make that rhythm playable: ways to build the stack
 * cheaply, ways to protect yourself while you build it, and ways to make the
 * cash-out worth having waited for.
 */

import type { CardDef } from '../../engine/types.ts';
import { VULNERABLE, WEAK } from '../statuses.ts';

export const FOCUS_CARDS: readonly CardDef[] = [
  {
    id: 'settle',
    name: 'Settle',
    type: 'skill',
    rarity: 'common',
    archetype: 'iai',
    cost: 0,
    effects: [{ op: 'gainFocus', amount: 1 }],
    stanceRider: { stance: 'guard', effects: [{ op: 'block', amount: 4 }] },
    upgrade: { name: 'Settle+', effects: [{ op: 'gainFocus', amount: 2 }] },
    flavor: 'Not stillness. Load-bearing patience.',
  },

  {
    id: 'held_breath',
    name: 'Held Breath',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'block', amount: 7 },
      { op: 'gainFocus', amount: 1 },
    ],
    stanceRider: { stance: 'guard', effects: [{ op: 'ventHeat', amount: 1 }] },
    upgrade: {
      name: 'Held Breath+',
      effects: [
        { op: 'block', amount: 10 },
        { op: 'gainFocus', amount: 2 },
      ],
    },
    flavor: 'Every second you do not swing is a second the blade gets heavier.',
  },

  {
    id: 'gathering',
    name: 'Gathering',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    effects: [
      { op: 'gainFocus', amount: 2 },
      { op: 'draw', amount: 1 },
    ],
    stanceRider: { stance: 'guard', effects: [{ op: 'gainFocus', amount: 1 }] },
    upgrade: {
      name: 'Gathering+',
      effects: [
        { op: 'gainFocus', amount: 3 },
        { op: 'draw', amount: 1 },
      ],
    },
    flavor: 'Collect it the way you collect debts. Quietly, and all at once.',
  },

  {
    id: 'the_long_draw',
    name: 'The Long Draw',
    type: 'attack',
    rarity: 'rare',
    archetype: 'iai',
    cost: 1,
    // Scales on the stack itself, on top of the stack it is already spending.
    // In IAI this is the cash-out; in GUARD it is a weak hit that keeps the
    // bank intact, which is exactly the decision the stance layer is for.
    effects: [
      { op: 'damage', amount: 4, target: 'enemy' },
      { op: 'scaleWith', source: 'focus', per: 1, then: [{ op: 'damage', amount: 2, target: 'enemy' }] },
    ],
    upgrade: {
      name: 'The Long Draw+',
      effects: [
        { op: 'damage', amount: 6, target: 'enemy' },
        { op: 'scaleWith', source: 'focus', per: 1, then: [{ op: 'damage', amount: 3, target: 'enemy' }] },
      ],
    },
    flavor: 'The cut is short. Everything before it was not.',
  },

  {
    id: 'point_of_release',
    name: 'Point of Release',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 2,
    effects: [
      { op: 'damage', amount: 9, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'stanceIs', stance: 'iai' },
        then: [{ op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' }],
        else: [{ op: 'gainFocus', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Point of Release+',
      effects: [
        { op: 'damage', amount: 13, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'stanceIs', stance: 'iai' },
          then: [{ op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' }],
          else: [{ op: 'gainFocus', amount: 3 }],
        },
      ],
    },
    flavor: 'Both halves are the technique. Only one of them is the cut.',
  },

  {
    id: 'stillwater_guard',
    name: 'Stillwater Guard',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'block', amount: 5 },
      { op: 'ventHeat', amount: 2 },
      { op: 'gainFocus', amount: 1 },
    ],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' }],
    },
    upgrade: {
      name: 'Stillwater Guard+',
      effects: [
        { op: 'block', amount: 8 },
        { op: 'ventHeat', amount: 3 },
        { op: 'gainFocus', amount: 1 },
      ],
    },
    flavor: 'Cold water, cold reactor, cold hands. Wait.',
  },
];
