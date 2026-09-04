/* GUARD cards — receive, then answer.
 *
 * GUARD vents Heat and keeps 3 Block across the turn, so these cards trade
 * tempo for staying power and blunt what is coming rather than racing it.
 */

import type { CardDef } from '../../engine/types.ts';
import { TEMPERED, WEAK } from '../statuses.ts';

export const GUARD_CARDS: readonly CardDef[] = [
  {
    id: 'bulwark',
    name: 'Bulwark',
    type: 'skill',
    /* Uncommon at 10, where it was a common at 8.
       Ten Block for one Energy is more than a common should be allowed to do
       flat — it answers a whole Act 1 turn by itself. The tier is the price of
       the number, not a judgement about the card. */
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 10 }],
    upgrade: { name: 'Bulwark+', effects: [{ op: 'block', amount: 13 }] },
    flavor: 'Plate salvaged off something that did not survive needing it.',
  },

  {
    id: 'deflection_field',
    name: 'Deflection Field',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    /* 6, and the rider is the card.
       Bulwark now prints 10 at the same cost and the same tier, so there is no
       version of this that competes on the Block figure — which is the point.
       You take this one because a stack of Weak across the whole board is worth
       more than four Block, and on the turns it is not, you take the other. */
    effects: [{ op: 'block', amount: 6 }],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'allEnemies' }],
    },
    upgrade: { name: 'Deflection Field+', effects: [{ op: 'block', amount: 9 }] },
    flavor: 'Not a wall. A suggestion, made forcefully, about where things should go.',
  },

  {
    /* Tempered's entry point, and it had none — the status started at uncommon
       and climbed, so a deck either found Settle the Stance or never met the
       mechanic at all. A common has to teach it: four Block is plainly worse
       than Bulwark's ten and the stack is why you would take it anyway, which
       is the whole lesson about armour you keep against armour you rebuild.

       One stack. Tempered never falls off now, so a common that printed two
       would be a common that ends Act 1 fights on its own if you saw it
       twice. */
    id: 'take_the_weight',
    name: 'Take the Weight',
    type: 'skill',
    /* Up a tier. A permanent Tempered stack for one Energy is the cheapest
       lasting mitigation in the game, and the exhaust only limits it per COPY —
       two commons in a deck is still two stacks for the run. The comment below
       is the argument for why it must exhaust; it is also the argument for why
       it was never really a common. */
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    /* Burn. Tempered never falls off, so a card that grants it and stays in the
       deck is a card that grants it again every shuffle — a common that ends
       the run at 6 armour if the fight goes long enough. Once per copy is the
       whole of what makes a permanent stack safe to print this low. */
    exhaust: true,
    /* A Weak on yourself is the price of the permanent stack, where it used to
       be two Heat.
     *
       Heat was the wrong currency for this card. It is a GUARD card and Heat is
       IAI's problem — a defensive deck sitting at two Heat has paid nothing at
       all, so the cost fell entirely on the decks that were not buying. Weak
       lands on every deck equally and it lands on the turn you take the armour:
       you spend a turn hitting softer to be harder for the rest of the fight,
       which is the trade the card is actually about.
     *
       One stack, and player-applied debuffs shed at the end of the round they
       are applied — so this is one turn of hitting softer, not a lasting
       penalty stapled to a lasting benefit. */
    effects: [
      { op: 'block', amount: 4 },
      { op: 'applyStatus', status: TEMPERED, stacks: 1, target: 'self' },
      { op: 'applyStatus', status: WEAK, stacks: 1, target: 'self' },
    ],
    upgrade: {
      name: 'Take the Weight+',
      effects: [
        { op: 'block', amount: 6 },
        { op: 'applyStatus', status: TEMPERED, stacks: 1, target: 'self' },
        { op: 'applyStatus', status: WEAK, stacks: 1, target: 'self' },
      ],
    },
    flavor: 'Not caught. Accepted, and then carried.',
  },

  {
    id: 'iron_wake',
    name: 'Iron Wake',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 2,
    effects: [
      { op: 'block', amount: 14 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Iron Wake+',
      effects: [
        { op: 'block', amount: 18 },
        { op: 'ventHeat', amount: 3 },
      ],
    },
    flavor: 'Drift, and let the hull do the arguing.',
  },

  {
    id: 'counterweight',
    name: 'Counterweight',
    type: 'attack',
    rarity: 'epic',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'damage', amount: 0, target: 'enemy', plusPer: { source: 'blockGainedThisTurn', per: 3, amount: 2 } },
    ],
    upgrade: {
      name: 'Counterweight+',
      effects: [
        { op: 'damage', amount: 0, target: 'enemy', plusPer: { source: 'blockGainedThisTurn', per: 3, amount: 3 } },
      ],
    },
    flavor: 'Everything you put in front of you is also something to swing.',
  },

  {
    id: 'standing_wave',
    name: 'Standing Wave',
    type: 'skill',
    rarity: 'legendary',
    archetype: 'guard',
    cost: 2,
    /* No Burn any more — the Weak is the limit instead.
     *
     * A wall you get once a fight is a wall you hold for one turn, and the card
     * wanted to be the answer to a whole fight rather than to a single swing.
     * Repeatable, two Weak is what stops it being free: hold the position and
     * you are hitting at half strength while you do. That is a real defensive
     * BUILD rather than one good turn, and it prices itself — Weak caps at two
     * stacks, so playing it every turn keeps you there and never worse. */
    effects: [
      { op: 'block', amount: 24 },
      { op: 'applyStatus', status: WEAK, stacks: 2, target: 'self' },
    ],
    stanceRider: {
      stance: 'guard',
      effects: [
        { op: 'block', amount: 10 },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'allEnemies' },
      ],
    },
    upgrade: {
      name: 'Standing Wave+',
      effects: [
        { op: 'block', amount: 32 },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'self' },
      ],
    },
    flavor: 'Hold the position long enough and the position starts holding you.',
  },

  /* ---- the second batch ----
     Written against gaps rather than to a count. GUARD had eleven ways to gain
     Block and no way to be rewarded for having gained a lot of it beyond
     Counterweight, and nothing at all that read the hull — a defensive
     archetype with no desperation card is a defensive archetype that plays the
     same on turn one and on your last four health. */

  {
    id: 'set_the_anchor',
    name: 'Set the Anchor',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 0,
    effects: [
      { op: 'block', amount: 4 },
      { op: 'gainHeat', amount: 1 },
    ],
    upgrade: {
      name: 'Set the Anchor+',
      effects: [
        { op: 'block', amount: 7 },
        { op: 'gainHeat', amount: 1 },
      ],
    },
    flavor: 'Free is a word that means the bill comes later.',
  },

  {
    id: 'riposte_plate',
    name: 'Riposte Plate',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'block', amount: 5 }],
    // In GUARD the plate answers back. Everywhere else it is just a plate.
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'damage', amount: 5, target: 'enemy' }],
    },
    upgrade: {
      name: 'Riposte Plate+',
      effects: [{ op: 'block', amount: 8 }],
      stanceRider: {
        stance: 'guard',
        effects: [{ op: 'damage', amount: 7, target: 'enemy' }],
      },
    },
    flavor: 'Meeting it is half of stopping it.',
  },

  {
    id: 'ablative_layer',
    name: 'Ablative Layer',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    // Rewards a turn already spent on Block rather than starting one, which is
    // the difference between a defensive card and a defensive TURN.
    effects: [
      { op: 'block', amount: 5 },
      { op: 'scaleWith', source: 'blockGainedThisTurn', per: 5, then: [{ op: 'block', amount: 3 }] },
    ],
    upgrade: {
      name: 'Ablative Layer+',
      effects: [
        { op: 'block', amount: 7 },
        { op: 'scaleWith', source: 'blockGainedThisTurn', per: 4, then: [{ op: 'block', amount: 3 }] },
      ],
    },
    flavor: 'Layer over layer until the shape of it stops mattering.',
  },

  {
    id: 'grounding_strap',
    name: 'Grounding Strap',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'block', amount: 6 },
      { op: 'ventHeat', amount: 3 },
    ],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'draw', amount: 1 }],
    },
    upgrade: {
      name: 'Grounding Strap+',
      effects: [
        { op: 'block', amount: 9 },
        { op: 'ventHeat', amount: 4 },
      ],
      stanceRider: {
        stance: 'guard',
        effects: [{ op: 'draw', amount: 1 }],
      },
    },
    flavor: 'Somewhere for it all to go that is not you.',
  },

  {
    id: 'the_last_plate',
    name: 'The Last Plate',
    type: 'skill',
    rarity: 'legendary',
    archetype: 'guard',
    cost: 1,
    exhaust: true,
    /* The first card in the game that reads the hull. Dead weight at full
       health and the reason you are still flying at a fifth of it — which is a
       card that changes what your deck IS at the point the run gets hard,
       rather than one that is good all the time by a bit. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 40 },
        then: [{ op: 'block', amount: 28 }],
        else: [{ op: 'block', amount: 9 }],
      },
    ],
    upgrade: {
      name: 'The Last Plate+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 50 },
          then: [{ op: 'block', amount: 34 }],
          else: [{ op: 'block', amount: 12 }],
        },
      ],
    },
    flavor: 'Kept back for the day it is the only one left. Today, apparently.',
  },
];
