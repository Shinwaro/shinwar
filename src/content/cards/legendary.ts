/* The three-Energy cards.
 *
 * Nothing else in the pool costs three, which is the point: a full turn on one
 * card is a different kind of decision from two cards that cost one and two.
 * You give up the whole turn's flexibility — no reacting to what the telegraph
 * says, no second card if the first one was the wrong read — and what you get
 * back has to be worth having planned for.
 *
 * So each of these is the ceiling of one pillar rather than a big number:
 *
 *   The Whole Sword    the Focus archetype's payoff, and the only card that
 *                      multiplies a bank it does not spend
 *   Absolute Zero      the defensive turnaround — the answer to a board you
 *                      have already lost the tempo of
 *   Cut the Line       the execution ceiling, and dead weight against a boss
 *
 * That last one matters: a legendary that is always correct is a legendary
 * that removes a decision. Each of these is a bad draw somewhere.
 */

import type { CardDef } from '../../engine/types.ts';
import { TEMPERED, VULNERABLE, WEAK } from '../statuses.ts';

export const LEGENDARY_CARDS: readonly CardDef[] = [
  {
    id: 'the_whole_sword',
    name: 'The Whole Sword',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'iai',
    cost: 3,
    exhaust: true,
    /* `keepsFocus`, so the scaling reads the whole bank instead of spending a
       stack on the first instance and scaling off what is left. Three hits at
       nine plus three per Focus is 27 at empty and 81 at a full six — which is
       absurd, and is meant to be: it is three Energy, it exhausts, and getting
       to six Focus is most of a deck's worth of decisions. */
    keepsFocus: true,
    effects: [
      { op: 'damage', amount: 9, target: 'enemy', times: 3 },
      { op: 'scaleWith', source: 'focus', per: 1, then: [{ op: 'damage', amount: 3, target: 'enemy' }] },
    ],
    upgrade: {
      name: 'The Whole Sword+',
      effects: [
        { op: 'damage', amount: 12, target: 'enemy', times: 3 },
        { op: 'scaleWith', source: 'focus', per: 1, then: [{ op: 'damage', amount: 4, target: 'enemy' }] },
      ],
    },
    flavor: 'Everything the order ever taught, spent at once, on one person.',
  },

  {
    id: 'absolute_zero',
    name: 'Absolute Zero',
    type: 'skill',
    rarity: 'legendary',
    archetype: 'guard',
    cost: 3,
    exhaust: true,
    /* The turnaround. Not just a wall — the Weak is what stops the next two
       turns being the same problem, and the Tempered is what stops the wall
       being the only thing holding. Vents the whole gauge, so it is also the
       card that lets an overheat deck take one enormous risk and then step
       off it. */
    effects: [
      { op: 'block', amount: 26 },
      { op: 'ventHeat', amount: 10 },
      { op: 'applyStatus', status: WEAK, stacks: 2, target: 'allEnemies' },
      { op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' },
    ],
    upgrade: {
      name: 'Absolute Zero+',
      effects: [
        { op: 'block', amount: 34 },
        { op: 'ventHeat', amount: 10 },
        { op: 'applyStatus', status: WEAK, stacks: 3, target: 'allEnemies' },
        { op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' },
      ],
    },
    flavor: 'Everything stops. The reactor, the argument, the man with the pipe.',
  },

  {
    id: 'cut_the_line',
    name: 'Cut the Line',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 3,
    /* Does NOT exhaust, and that is the whole card: against a pack it comes
       back, and each time it does it refunds the turn it cost. Against a boss
       it is a 22-damage three-cost with a dead rider — a legendary that is
       always correct is a legendary that removes a decision. */
    effects: [
      { op: 'damage', amount: 22, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [
          { op: 'gainEnergy', amount: 3 },
          { op: 'draw', amount: 2 },
        ],
      },
    ],
    upgrade: {
      name: 'Cut the Line+',
      effects: [
        { op: 'damage', amount: 28, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [
            { op: 'gainEnergy', amount: 3 },
            { op: 'draw', amount: 3 },
          ],
        },
      ],
    },
    flavor: 'Take the one at the front and the rest of it stops being a formation.',
  },
];
