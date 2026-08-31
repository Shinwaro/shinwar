/* Discard cards — the answer to a hand that cannot do anything.
 *
 * Robin's ask, and it names a real gap: some turns you draw five cards that do
 * not combine, there is no play worth making, and the only option is to end the
 * turn and hope. That is not a decision, it is a wait. These are the cards that
 * turn a bad hand into a resource instead of a verdict.
 *
 * Two shapes:
 *
 *   - **Trade a card for cards.** Overdraw draws three and throws one at random.
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
 *
 * **Every card that throws the WHOLE hand exhausts.** One reset a fight, not a
 * loop. Without it the pattern is: play the hand-dump, draw a fresh hand, find
 * the dump again a few turns later, and repeat — a deck that never has a bad
 * hand because it never keeps one, which is a strictly better version of every
 * deck rather than a different one. The turn it buys you should cost you the
 * card that bought it.
 *
 * The partial ones — Overdraw, First to Hand, Hard Turn — do not
 * exhaust. They pay a card for what they do every single time they are played,
 * so they are already self-limiting in the way the whole-hand cards are not.
 * There is a test holding the line.
 */

import type { CardDef } from '../../engine/types.ts';

/** Named because the starting deck holds one — see `STARTING_DECK`. */
export const JETTISON = 'jettison';

export const DISCARD_CARDS: readonly CardDef[] = [
  /* Sift was here: uncommon, "discard 1 at random, draw 3".
     Removed. Overdraw is the same card one tier down — draw 3, discard 1 at
     random — and two cards whose only difference is which end the discard
     happens at is one card and a duplicate. */

  {
    /* A clean second hand. Card-neutral by design — it is not draw, it is a
       re-deal, and paying an Energy for the same number of cards is only worth
       it when the ones you have are worth nothing. Free at +, which is when it
       becomes a thing you can afford to do on the turn you needed it. */
    id: JETTISON,
    name: 'Jettison',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    exhaust: true,
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
    rarity: 'epic',
    archetype: 'neutral',
    cost: 1,
    exhaust: true,
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
    rarity: 'epic',
    archetype: 'guard',
    cost: 1,
    exhaust: true,
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

  /* ---- the cheap ones ----
     A common is the card you meet in Act 1 and keep for the whole run if the
     deck goes that way, so both of these pay in a currency the opening act
     already cares about: the gauge, and one big number. */

  {
    /* Nine for one Energy is well above the curve, and the random card is the
       whole of the price. It is the common that makes a discard deck want to
       be a discard deck. */
    id: 'first_to_hand',
    name: 'First to Hand',
    type: 'attack',
    rarity: 'common',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'discard', amount: 1, random: true },
      { op: 'damage', amount: 9, target: 'enemy' },
    ],
    upgrade: {
      name: 'First to Hand+',
      effects: [
        { op: 'discard', amount: 1, random: true },
        { op: 'damage', amount: 12, target: 'enemy' },
      ],
    },
    flavor: 'Not the form the situation called for. The form that was closest.',
  },

  {
    /* Two cards for a board clear. The cost scales with how much you have left
       to lose, which is the shape the whole file is built on — expensive on a
       full hand, nearly free on a spent one, and the choice is when. */
    id: 'hard_turn',
    name: 'Hard Turn',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'discard', amount: 2, random: true },
      { op: 'damage', amount: 7, target: 'allEnemies' },
    ],
    upgrade: {
      name: 'Hard Turn+',
      effects: [
        { op: 'discard', amount: 2, random: true },
        { op: 'damage', amount: 9, target: 'allEnemies' },
      ],
    },
    flavor: 'The cutter can take it. The hold cannot.',
  },

  /* ---- the ones that pay in the other resources ---- */

  {
    /* Focus caps at 6, which is the balance on this: a five-card hand does not
       hand you eleven, it hands you the ceiling. So it is a card that wants a
       hand of three or four you had given up on, not a card that wants the
       biggest hand possible — the opposite of the file's other whole-hand
       cards, deliberately. */
    id: 'pare_down',
    name: 'Pare Down',
    type: 'skill',
    rarity: 'epic',
    archetype: 'iai',
    cost: 1,
    exhaust: true,
    effects: [
      { op: 'discard', amount: 0, all: true },
      { op: 'scaleWith', source: 'discardedThisPlay', per: 1, then: [{ op: 'gainFocus', amount: 1 }] },
    ],
    upgrade: {
      name: 'Pare Down+',
      effects: [
        { op: 'discard', amount: 0, all: true },
        { op: 'scaleWith', source: 'discardedThisPlay', per: 1, then: [{ op: 'gainFocus', amount: 1 }] },
        { op: 'draw', amount: 1 },
      ],
    },
    flavor: 'Everything you know, and then only the part of it that cuts.',
  },

  {
    /* The engine card: it pays back the Energy it cost and then some, but only
       out of a hand you were willing to lose. Two Energy in, one back for every
       two cards thrown, and two fresh cards to spend it on — so a dead hand of
       four is a turn that starts again rather than a turn that ends. */
    id: 'purge_the_lines',
    name: 'Purge the Lines',
    type: 'skill',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'discard', amount: 0, all: true },
      { op: 'scaleWith', source: 'discardedThisPlay', per: 2, then: [{ op: 'gainEnergy', amount: 1 }] },
      { op: 'draw', amount: 2 },
    ],
    upgrade: {
      name: 'Purge the Lines+',
      effects: [
        { op: 'discard', amount: 0, all: true },
        { op: 'scaleWith', source: 'discardedThisPlay', per: 2, then: [{ op: 'gainEnergy', amount: 1 }] },
        { op: 'draw', amount: 3 },
      ],
    },
    flavor: 'Everything the lines were holding, all of it, into the dark.',
  },

  {
    /* Empty the Rack across the whole board — the answer to one specific room
       rather than the thing the deck is about. */
    id: 'broken_formation',
    name: 'Broken Formation',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 1,
    exhaust: true,
    /* Two, not three. At three it was Empty the Rack's number applied to the
       whole board for the same Energy, which makes the single-target card
       pointless in every fight with more than one enemy — and Empty the Rack
       has to still be worth taking at its own tier. */
    effects: [
      { op: 'discard', amount: 0, all: true },
      {
        op: 'scaleWith',
        source: 'discardedThisPlay',
        per: 1,
        then: [{ op: 'damage', amount: 2, target: 'allEnemies' }],
      },
    ],
    upgrade: {
      name: 'Broken Formation+',
      effects: [
        { op: 'discard', amount: 0, all: true },
        {
          op: 'scaleWith',
          source: 'discardedThisPlay',
          per: 1,
          then: [{ op: 'damage', amount: 3, target: 'allEnemies' }],
        },
      ],
    },
    flavor: 'They were standing in ranks a moment ago. That was the mistake.',
  },
];
