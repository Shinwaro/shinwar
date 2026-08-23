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
    // Hairline is a 0-cost common for 4. A 1-cost rare printing 6 before its
    // rider is not a rare, it is a worse Hairline with a condition attached.
    /* The upgrade buys the THRESHOLD as well as the number. 8 at 5+ Heat, then
       10 at 4+ — so forging it does not only make the card bigger, it makes the
       condition easier to be standing in, which is the thing the card is
       actually asking you to arrange. */
    effects: [{ op: 'damage', amount: 8, target: 'enemy' }],
    stanceRider: {
      stance: 'iai',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 5 },
          then: [{ op: 'damage', amount: 8, target: 'enemy' }],
        },
      ],
    },
    upgrade: {
      name: 'Crossing Arc+',
      effects: [{ op: 'damage', amount: 10, target: 'enemy' }],
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

  /* ---- the second batch ----
     IAI could build Focus and spend Focus and had nothing that cared what was
     already wrong with the target. `targetHasStatus` had been in the condition
     vocabulary since M1 and no card had ever used it, which meant Vulnerable
     was a damage multiplier and nothing else. */

  {
    id: 'half_draw',
    name: 'Half Draw',
    type: 'attack',
    rarity: 'common',
    archetype: 'iai',
    cost: 0,
    effects: [{ op: 'damage', amount: 3, target: 'enemy' }],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'gainFocus', amount: 1 }],
    },
    upgrade: {
      name: 'Half Draw+',
      effects: [{ op: 'damage', amount: 5, target: 'enemy' }],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'gainFocus', amount: 1 }],
      },
    },
    flavor: 'Not the cut. The part before it that decides the cut.',
  },

  {
    id: 'opening_cut',
    name: 'Opening Cut',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    // Asks a question about the board rather than about your own gauges, which
    // is the whole reason to carry a debuff at all.
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'targetHasStatus', status: VULNERABLE },
        then: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Opening Cut+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'targetHasStatus', status: VULNERABLE },
          then: [{ op: 'damage', amount: 8, target: 'enemy' }],
        },
      ],
    },
    flavor: 'You do not make the opening. You notice it.',
  },

  {
    id: 'silent_form',
    name: 'Silent Form',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'iai',
    // Free. It is a stance change with a condition on it, and a stance change
    // you have to pay an Energy for is one you mostly do not make.
    cost: 0,
    /* The only card that names a stance rather than cycling to the next one,
       and it pays you for already being there.

       **Order is the whole card.** The conditional runs first: setting the
       stance and then asking whether you are in it answers yes every time, and
       the card becomes an unconditional 2 Focus with a stance change attached.
       Effects resolve in written order, so written order is the rule. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'stanceIs', stance: 'iai' },
        then: [{ op: 'gainFocus', amount: 2 }],
      },
      { op: 'setStance', stance: 'iai' },
    ],
    upgrade: {
      name: 'Silent Form+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'stanceIs', stance: 'iai' },
          then: [
            { op: 'gainFocus', amount: 3 },
            { op: 'draw', amount: 1 },
          ],
        },
        { op: 'setStance', stance: 'iai' },
      ],
    },
    flavor: 'Arriving somewhere on purpose, for once.',
  },

  {
    id: 'wavefront_cut',
    name: 'Wavefront Cut',
    type: 'attack',
    rarity: 'rare',
    archetype: 'iai',
    cost: 2,
    effects: [
      { op: 'damage', amount: 9, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
    },
    upgrade: {
      name: 'Wavefront Cut+',
      effects: [
        { op: 'damage', amount: 12, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
      ],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'damage', amount: 8, target: 'enemy' }],
      },
    },
    flavor: 'It arrives before the sound does and leaves before the sound catches up.',
  },
];
