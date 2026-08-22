/* Discard cards — the answer to a hand that cannot do anything.
 *
 * Robin's ask, and it names a real gap: some turns you draw five cards that do
 * not combine, there is no play worth making, and the only option is to end the
 * turn and hope. That is not a decision, it is a wait. These are the cards that
 * turn a bad hand into a resource instead of a verdict.
 *
 * Two shapes:
 *
 *   - **Trade a card for cards.** Sift throws one at random and draws three.
 *     You do not choose what goes, which is what keeps it from being a
 *     strictly-better draw spell — sometimes it eats the one good card you had.
 *   - **Spend the whole hand.** Jettison turns it over for a fresh one, and
 *     Empty the Rack and Shed Weight convert it into damage or Block. A dead
 *     hand of five is 15 damage or 20 Block, which is a real turn.
 *
 * The whole-hand cards scale on `discardedThisPlay`, so they pay for what THIS
 * card threw away — the same scoping as the execution cards' `killsThisPlay`,
 * and for the same reason. They are deliberately weak on a good hand: playing
 * Empty the Rack with four cards you wanted is a bad play and should feel like
 * one. What they are worth is the floor they put under the turn you drew badly.
 *
 * Ordering matters and is load-bearing: the discard op comes FIRST and the
 * scaling op reads the count it left behind. Written the other way round, the
 * card would scale on nothing and always do zero.
 */

import type { CardDef } from '../../engine/types.ts';

export const DISCARD_CARDS: readonly CardDef[] = [
  {
    /* Net two cards for one Energy, at the cost of not choosing which one goes.
       The randomness is the price: a card that let you pick would be a strictly
       better Measured Draw, and this is meant to be the card you reach for when
       the hand is already bad, not the card you always run. */
    id: 'sift',
    name: 'Sift',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'discard', amount: 1, random: true },
      { op: 'draw', amount: 3 },
    ],
    upgrade: {
      name: 'Sift+',
      effects: [
        { op: 'discard', amount: 1, random: true },
        { op: 'draw', amount: 4 },
      ],
    },
    flavor: 'Most of what the rack holds is not the answer to this.',
  },

  {
    /* A clean second hand. Card-neutral by design — it is not draw, it is a
       re-deal, and paying an Energy for the same number of cards is only worth
       it when the ones you have are worth nothing. Free at +, which is when it
       becomes a thing you can afford to do on the turn you needed it. */
    id: 'jettison',
    name: 'Jettison',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'discard', amount: 0, all: true },
      { op: 'scaleWith', source: 'discardedThisPlay', per: 1, then: [{ op: 'draw', amount: 1 }] },
    ],
    upgrade: {
      name: 'Jettison+',
      cost: 0,
      effects: [
        { op: 'discard', amount: 0, all: true },
        { op: 'scaleWith', source: 'discardedThisPlay', per: 1, then: [{ op: 'draw', amount: 1 }] },
      ],
    },
    flavor: 'The hold is not sacred. The heading is.',
  },

  {
    /* The hand as ammunition. Four dead cards is 12 to one target for one
       Energy, which beats anything else at that cost — and it costs you the
       turn's every other option to get there, since there is nothing left to
       play afterwards. */
    id: 'empty_the_rack',
    name: 'Empty the Rack',
    type: 'attack',
    rarity: 'rare',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'discard', amount: 0, all: true },
      {
        op: 'scaleWith',
        source: 'discardedThisPlay',
        per: 1,
        then: [{ op: 'damage', amount: 3, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Empty the Rack+',
      effects: [
        { op: 'discard', amount: 0, all: true },
        {
          op: 'scaleWith',
          source: 'discardedThisPlay',
          per: 1,
          then: [{ op: 'damage', amount: 4, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Every form you know, thrown at once, in no order at all.',
  },

  {
    /* The same trade on the other side of the fight, and the reason both exist:
       a hand you cannot attack with and a hand you cannot defend with are the
       same hand, and which of these you are holding decides what that hand
       becomes. */
    id: 'shed_weight',
    name: 'Shed Weight',
    type: 'skill',
    rarity: 'rare',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'discard', amount: 0, all: true },
      {
        op: 'scaleWith',
        source: 'discardedThisPlay',
        per: 1,
        then: [{ op: 'block', amount: 4 }],
      },
    ],
    upgrade: {
      name: 'Shed Weight+',
      effects: [
        { op: 'discard', amount: 0, all: true },
        {
          op: 'scaleWith',
          source: 'discardedThisPlay',
          per: 1,
          then: [{ op: 'block', amount: 5 }],
        },
      ],
    },
    flavor: 'Anything not bolted down is armour, briefly.',
  },
];
