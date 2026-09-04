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

/** Named because the starting deck holds one. */
export const STILLWATER_GUARD = 'stillwater_guard';

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
    /* Two off the gauge in GUARD, not one. A single point is inside the noise
       of a stance that already vents one at turn end — the rider was a line of
       text for an effect the player could not feel. */
    stanceRider: { stance: 'guard', effects: [{ op: 'ventHeat', amount: 2 }] },
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
    id: 'the_long_draw',
    name: 'The Long Draw',
    type: 'attack',
    rarity: 'epic',
    archetype: 'iai',
    cost: 1,
    /*
     * `keepsFocus` is what lets the base hit come first.
     *
     * It used to be the other way round out of necessity: in IAI the opening
     * damage instance spent the Focus stack, so a `scaleWith` placed after it
     * read zero and the card's whole rare-tier payoff quietly did nothing. Now
     * that nothing here consumes the stack, execution order stops mattering —
     * so the ops are in the order the card reads in, which is the order a
     * player would say it out loud.
     */
    keepsFocus: true,
    effects: [
      { op: 'damage', amount: 6, target: 'enemy', plusPer: { source: 'focus', per: 1, amount: 3 } },
    ],
    upgrade: {
      name: 'The Long Draw+',
      effects: [
        { op: 'damage', amount: 9, target: 'enemy', plusPer: { source: 'focus', per: 1, amount: 4 } },
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
    /* In the starting deck — see `STARTING_DECK`. It is the opening hand's only
       answer to Heat that also does something on the turn you play it, and its
       vent of 2 is exactly the threshold that sheds a stack of Scald, so a new
       player has a reply to that status in the deck before they have ever met
       it. */
    id: STILLWATER_GUARD,
    name: 'Stillwater Guard',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    /* Two Energy, and 8 Block for it. At 1 it was three clauses and a stance
       rider for the price of the cheapest card in the game — the opening play
       of every GUARD turn, every turn, which is a card that removes the
       decision it was supposed to be. At 2 it is a turn's worth of Energy and
       has to earn it. */
    cost: 2,
    effects: [
      { op: 'block', amount: 8 },
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
        { op: 'block', amount: 12 },
        { op: 'ventHeat', amount: 3 },
        { op: 'gainFocus', amount: 1 },
      ],
    },
    flavor: 'Cold water, cold reactor, cold hands. Wait.',
  },
];
