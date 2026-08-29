/* Cards that read the hull.
 *
 * The one axis the deck could not see. Heat, Focus and stance are all things
 * you spend a turn arranging; health is the thing the whole run is about, and
 * until now exactly one card in the pool looked at it.
 *
 * Both directions, deliberately. `hullBelowPct` alone only ever produces
 * comeback cards — dead weight until the run goes wrong — and a deck of those
 * is a deck that wants to be hurt, which is a strange thing to build toward. A
 * card that pays ABOVE a line is the opposite bet: it asks you to stay clean,
 * and staying clean is a plan you can hold from the first node.
 *
 * The two never overlap. `hullBelowPct` is strictly below and `hullAbovePct`
 * strictly above, so a pair written against the same number has a seam at
 * exactly that number rather than a turn where both fire.
 *
 * The percentages print with the live health beside them — "below 40% (26
 * health)" — because max health moves across a run and a fraction alone is a
 * rule rather than a decision. That is `describeCondition`, not written here.
 */

import type { CardDef } from '../../engine/types.ts';
import { WEAK } from '../statuses.ts';

export const HULL_CARDS: readonly CardDef[] = [
  /* ---- the low side: cards that get better as it gets worse ---- */

  {
    id: 'red_line',
    name: 'Red Line',
    type: 'attack',
    rarity: 'common',
    archetype: 'iai',
    cost: 1,
    /* A common, so the floor has to be a card you would play anyway: 6 for 1 is
       fair on its own and the threshold is the upside. A common whose base case
       is unplayable is a common you resent drawing for the first two acts. */
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 50 },
        then: [{ op: 'damage', amount: 4, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Red Line+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 50 },
          then: [{ op: 'damage', amount: 6, target: 'enemy' }],
        },
      ],
    },
    flavor: 'The gauge has been in the red so long you have stopped reading it.',
  },

  {
    id: 'nothing_left_to_lose',
    name: 'Nothing Left to Lose',
    type: 'attack',
    rarity: 'epic',
    archetype: 'iai',
    cost: 2,
    /* The steep one. 30% is a quarter of a run's worth of bad luck away, and
       the payoff is the largest single number a 2-cost can produce — but the
       base case is deliberately mediocre, so taking this is a bet on the run
       going badly rather than a card that is simply good. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 30 },
        then: [{ op: 'damage', amount: 26, target: 'enemy' }],
        else: [{ op: 'damage', amount: 10, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Nothing Left to Lose+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 40 },
          then: [{ op: 'damage', amount: 32, target: 'enemy' }],
          else: [{ op: 'damage', amount: 13, target: 'enemy' }],
        },
      ],
    },
    flavor: 'There is a kind of clarity down here. It is not a good kind.',
  },

  /* ---- the high side: cards that ask you to stay whole ---- */

  {
    id: 'unhurried',
    name: 'Unhurried',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 1,
    /* The mirror of Red Line and priced the same way: 6 Block for 1 is a card
       you play at any health, and being whole makes it one of the best commons
       in the game. It also rewards the thing a GUARD deck is already trying to
       do, which is the point of putting it in GUARD. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullAbovePct', value: 70 },
        then: [{ op: 'block', amount: 11 }],
        else: [{ op: 'block', amount: 6 }],
      },
    ],
    upgrade: {
      name: 'Unhurried+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullAbovePct', value: 70 },
          then: [{ op: 'block', amount: 15 }],
          else: [{ op: 'block', amount: 8 }],
        },
      ],
    },
    flavor: 'No wound to favour, no reason to rush. Both are the same advantage.',
  },

  {
    id: 'full_tanks',
    name: 'Full Tanks',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    /* An Energy back is the strongest thing a 1-cost can offer, so it is gated
       high and hard: above 80% is the first two acts of a careful run and
       nothing at all after one bad Elite. Draw 2 is the consolation, which
       makes the card a cycler the moment the run turns. */
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'hullAbovePct', value: 80 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Full Tanks+',
      effects: [
        { op: 'draw', amount: 2 },
        {
          op: 'conditional',
          when: { kind: 'hullAbovePct', value: 65 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'Everything topped off and nothing yet spent. It never lasts.',
  },

  {
    id: 'unblooded',
    name: 'Unblooded',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'guard',
    cost: 2,
    /* The epic on the high side, and the one that makes staying clean an
       archetype rather than a preference: a hit, the Weak that keeps you clean,
       and a second helping of both while you still are. Exhausts, because a
       card this good at the top of a run should not also be the card you draw
       four times in the fight that decides it. */
    exhaust: true,
    effects: [
      { op: 'damage', amount: 12, target: 'allEnemies' },
      { op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' },
      {
        op: 'conditional',
        when: { kind: 'hullAbovePct', value: 60 },
        then: [
          { op: 'block', amount: 10 },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' },
        ],
      },
    ],
    upgrade: {
      name: 'Unblooded+',
      effects: [
        { op: 'damage', amount: 16, target: 'allEnemies' },
        { op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' },
        {
          op: 'conditional',
          when: { kind: 'hullAbovePct', value: 60 },
          then: [
            { op: 'block', amount: 14 },
            { op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' },
          ],
        },
      ],
    },
    flavor: 'Forty of them and not one has touched you. They have noticed.',
  },
];
