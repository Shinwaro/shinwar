/* IAI cards — the draw-cut. Burst, Focus, and one decisive strike.
 *
 * The archetype's bargain: everything here wants you standing in IAI, and IAI
 * cooks you a point of Heat every turn you stay. Rules text is generated from
 * the ops below; only `flavor` is written by hand.
 */

import type { CardDef } from '../../engine/types.ts';
import { VULNERABLE } from '../statuses.ts';

export const IAI_CARDS: readonly CardDef[] = [
  {
    id: 'meridian_cut',
    name: 'Meridian Cut',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 2,
    effects: [
      { op: 'damage', amount: 12, target: 'enemy' },
      { op: 'gainHeat', amount: 2 },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [
        { op: 'damage', amount: 6, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
      ],
    },
    upgrade: {
      name: 'Meridian Cut+',
      effects: [
        { op: 'damage', amount: 16, target: 'enemy' },
        { op: 'gainHeat', amount: 2 },
      ],
    },
    flavor: 'One line, drawn through the middle of a thing that used to be whole.',
  },

  {
    id: 'drawn_breath',
    name: 'Drawn Breath',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    effects: [{ op: 'gainFocus', amount: 2 }],
    stanceRider: { stance: 'iai', effects: [{ op: 'draw', amount: 1 }] },
    upgrade: { name: 'Drawn Breath+', effects: [{ op: 'gainFocus', amount: 3 }] },
    flavor: 'The pause before is the technique. The cut is only its consequence.',
  },

  {
    id: 'crossing_arc',
    name: 'Crossing Arc',
    type: 'attack',
    rarity: 'rare',
    archetype: 'iai',
    cost: 1,
    effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
    stanceRider: {
      stance: 'iai',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 4 },
          then: [{ op: 'damage', amount: 8, target: 'enemy' }],
        },
      ],
    },
    upgrade: {
      name: 'Crossing Arc+',
      stanceRider: {
        stance: 'iai',
        effects: [
          {
            op: 'conditional',
            when: { kind: 'heatAtLeast', value: 4 },
            then: [{ op: 'damage', amount: 11, target: 'enemy' }],
          },
        ],
      },
    },
    flavor: 'A hot blade takes the second cut for free.',
  },

  {
    id: 'unsheathed_mind',
    name: 'Unsheathed Mind',
    type: 'attack',
    rarity: 'epic',
    archetype: 'iai',
    cost: 1,
    exhaust: true,
    effects: [
      { op: 'damage', amount: 20, target: 'enemy' },
      { op: 'gainHeat', amount: 3 },
    ],
    stanceRider: { stance: 'iai', effects: [{ op: 'gainFocus', amount: 2 }] },
    upgrade: {
      name: 'Unsheathed Mind+',
      effects: [
        { op: 'damage', amount: 26, target: 'enemy' },
        { op: 'gainHeat', amount: 3 },
      ],
    },
    flavor: 'The sect trained forty years to spend a single second exactly once.',
  },
];
