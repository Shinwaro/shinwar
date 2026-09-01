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
 *   The Long Corrosion the attrition ceiling, and far too slow to save you
 *
 * That last one matters: a legendary that is always correct is a legendary
 * that removes a decision. Each of these is a bad draw somewhere.
 */

import type { CardDef } from '../../engine/types.ts';
import { RUST, TEMPERED, WEAK } from '../statuses.ts';

export const LEGENDARY_CARDS: readonly CardDef[] = [
  {
    id: 'the_whole_sword',
    name: 'The Whole Sword',
    type: 'attack',
    rarity: 'mythic',
    archetype: 'iai',
    cost: 3,
    exhaust: true,
    /* Three hits of (8 + 2 per Focus). 24 at an empty bank, 60 at a full six.

       `keepsFocus`, so the scaling reads the whole bank rather than spending a
       stack on the first swing and scaling off what is left.

       The shape is the change, not the numbers. It used to be three hits at
       nine PLUS one extra three-damage hit per Focus — so at six Focus it was
       nine separate swings, and every per-hit bonus in the game multiplied by
       nine. At three Strength and a relic on every hit that was 81 becoming
       117, on a card whose face said nothing about it. Folding the Focus term
       into the size of each swing keeps this the biggest number in the game and
       makes three the most hits it can ever be — which is a thing you can read
       off the card instead of having to work out.

       Effectively flat at the top end and lower in the middle: 60 + 12 from
       bonuses at six Focus against the old 45 + 36. The ceiling is intact and
       the multiplier on it is gone. */
    keepsFocus: true,
    effects: [
      {
        op: 'damage',
        amount: 8,
        target: 'enemy',
        times: 3,
        plusPer: { source: 'focus', per: 1, amount: 2 },
      },
    ],
    upgrade: {
      name: 'The Whole Sword+',
      effects: [
        {
          op: 'damage',
          amount: 10,
          target: 'enemy',
          times: 3,
          plusPer: { source: 'focus', per: 1, amount: 3 },
        },
      ],
    },
    flavor: 'Everything the order ever taught, spent at once, on one person.',
  },

  {
    id: 'absolute_zero',
    name: 'Absolute Zero',
    type: 'skill',
    rarity: 'mythic',
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
    rarity: 'mythic',
    archetype: 'neutral',
    cost: 3,
    exhaust: true,
    /* One swing, once a fight.
     *
     * It used to stay in the deck, which made it a legendary that answered
     * every board: against a pack it came back and refunded the turn each
     * time, and the Vulnerable meant it also set up whatever followed it. Two
     * jobs and no cost. Now it is a single execution — 24 into one target, and
     * if that kills, the turn you spent comes back and the deck keeps moving.
     * Miss the kill and you paid three Energy and a card for damage.
     *
     * The Vulnerable came off with the same argument: an execution that also
     * softens the target for the NEXT card is a card that is never the wrong
     * play. Removing it is what puts the decision back — you play this to end
     * something, not to open on it. */
    effects: [
      { op: 'damage', amount: 24, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [
          /* Two of the three back, not all three. A kill that refunded the
             whole card made the execution free whenever it worked, and a card
             that is free when it works is a card you never have to time. */
          { op: 'gainEnergy', amount: 2 },
          { op: 'draw', amount: 2 },
        ],
      },
    ],
    upgrade: {
      name: 'Cut the Line+',
      effects: [
        { op: 'damage', amount: 30, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [
            { op: 'gainEnergy', amount: 2 },
            { op: 'draw', amount: 3 },
          ],
        },
      ],
    },
    flavor: 'Take the one at the front and the rest of it stops being a formation.',
  },

  {
    /* The attrition ceiling, and the pillar the three-cost slot did not have.
     *
     * Five Rust on everything is 30 unblockable a head, paid out over five of
     * their turns and stopped by nothing — no Block, no Tempered, no plating.
     * Against a wide Act 3 board that is more total damage than anything else
     * in the game.
     *
     * And it is the worst card here to draw at the wrong moment, which is what
     * earns it the slot. It deals eight damage the turn you play it. If the
     * fight ends in three turns you paid a whole turn for eight damage and a
     * burnt card; the Rust you were counting on is still on the board when the
     * board stops existing. It wins fights it was already going to win slowly
     * and it loses the ones that were going fast. */
    id: 'the_long_corrosion',
    name: 'The Long Corrosion',
    type: 'attack',
    rarity: 'mythic',
    archetype: 'neutral',
    cost: 3,
    exhaust: true,
    effects: [
      { op: 'damage', amount: 8, target: 'allEnemies' },
      { op: 'applyStatus', status: RUST, stacks: 5, target: 'allEnemies' },
    ],
    upgrade: {
      name: 'The Long Corrosion+',
      effects: [
        { op: 'damage', amount: 10, target: 'allEnemies' },
        { op: 'applyStatus', status: RUST, stacks: 6, target: 'allEnemies' },
      ],
    },
    flavor: 'It does not need you after this. It only needed the air and an opening.',
  },
];
