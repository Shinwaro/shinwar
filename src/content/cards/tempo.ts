/* Tempo cards — the long turn.
 *
 * Robin's ask: reward drawing, make a long turn possible, and let a set-up pay
 * off in one enormous swing. The existing pool could not do any of that, because
 * Energy and draw were fixed at 3 and 5 forever and nothing scaled on how much
 * you had already done this turn.
 *
 * Three levers, and they are meant to be combined:
 *
 *   - Heat buys Energy. The gauge stops being purely a cost and becomes a
 *     resource you can spend, which is what makes riding it toward the overheat
 *     line a real decision instead of a mistake.
 *   - Cards drawn beget cards played. Draw that pays for itself keeps the turn
 *     going rather than just replacing the card you spent.
 *   - Something at the end that scales on the whole turn, so a nine-card turn
 *     ends in a number a three-card turn cannot reach.
 *
 * They chain: Pressure Release into Open the Line into Long Form is a turn you
 * build rather than a hand you play.
 */

import type { CardDef } from '../../engine/types.ts';
import { RUST, VULNERABLE } from '../statuses.ts';

export const TEMPO_CARDS: readonly CardDef[] = [
  {
    id: 'pressure_release',
    name: 'Pressure Release',
    type: 'skill',
    rarity: 'common',
    archetype: 'overheat',
    cost: 0,
    /* The gate moved from 5 to 6, and the upgrade's from 4 to 5.

       At 5 the card was free Energy for most of a heat deck's turn: the
       archetype wants the gauge high anyway, so the condition was met by
       playing the deck as intended rather than by taking a risk. At 6 it pays
       two points from the line — you are choosing to sit inside the overheat
       window to get it, which is the bargain the card is supposed to be
       offering. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'gainEnergy', amount: 1 }],
        else: [{ op: 'gainHeat', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Pressure Release+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 5 },
          then: [{ op: 'gainEnergy', amount: 2 }],
          else: [{ op: 'gainHeat', amount: 2 }],
        },
      ],
    },
    flavor: 'Let it out through something useful on the way past.',
  },

  {
    id: 'open_the_line',
    name: 'Open the Line',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'cardsPlayedThisTurnAtLeast', value: 3 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Open the Line+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'cardsPlayedThisTurnAtLeast', value: 2 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'The third move is the one that shows you the fourth.',
  },

  {
    id: 'long_form',
    name: 'Long Form',
    type: 'attack',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 2,
    // The payoff card. On a three-card turn it is unremarkable; on a nine-card
    // turn it is the reason the other eight were worth playing.
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 1,
        then: [{ op: 'damage', amount: 4, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Long Form+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 1,
          then: [{ op: 'damage', amount: 6, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Forty years of drill, spent in the order they were learned.',
  },

  {
    id: 'held_line',
    name: 'Held Line',
    type: 'skill',
    rarity: 'epic',
    archetype: 'guard',
    cost: 1,
    effects: [
      { op: 'block', amount: 6 },
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 1,
        then: [{ op: 'block', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Held Line+',
      effects: [
        { op: 'block', amount: 9 },
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 1,
          then: [{ op: 'block', amount: 3 }],
        },
      ],
    },
    flavor: 'Every motion before this one was also the guard.',
  },

  {
    id: 'flashpoint',
    name: 'Flashpoint',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'overheat',
    cost: 1,
    exhaust: true,
    // The other end of the Heat bargain: the hotter you are, the harder this
    // lands, and it hands the gauge straight back down so the turn can continue.
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 1,
        then: [{ op: 'damage', amount: 3, target: 'enemy' }],
      },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
      { op: 'ventHeat', amount: 5 },
    ],
    upgrade: {
      name: 'Flashpoint+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 1,
          then: [{ op: 'damage', amount: 4, target: 'enemy' }],
        },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        { op: 'ventHeat', amount: 5 },
      ],
    },
    flavor: 'Spend the whole reactor through the edge and start again cold.',
  },

  {
    id: 'second_wind',
    name: 'Second Wind',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    /* Costs 1. At 0 it was a free look at three more cards with an Energy
       refund attached, which is not a decision -- there was never a turn where
       playing it first was wrong. */
    cost: 1,
    exhaust: true,
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'handSizeAtLeast', value: 7 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Second Wind+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'handSizeAtLeast', value: 6 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'You were not tired. You were between things.',
  },

  /* ---------- deliberately small ----------
     Cards that do one thing and interact with one mechanic. Tuned low on
     purpose: a card that is slightly too weak is a tuning number, and a card
     that does three things is a design decision you have to unpick. Every one
     of these touches Heat, the stance, or Focus — and only one of them. */

  /* Was two cards. `runaway_intake` was this exact card one rarity higher —
     0 Energy, +1 Energy, +3 Heat, same upgrade — which is both a duplicate and
     a tier inversion, since the uncommon offered nothing the common did not. */
  {
    id: 'stoke_the_core',
    name: 'Stoke the Core',
    type: 'skill',
    /* Epic, and it burns.
     *
     * A free Energy for 3 Heat is the whole overheat archetype in one card, and
     * as a repeatable common it was the archetype's floor rather than its
     * ceiling — every hot deck opened with it, every turn it appeared. Once a
     * fight, at a tier that means you had to be given it, it is the turn you
     * decide to spend rather than the turn you always have. */
    rarity: 'epic',
    archetype: 'overheat',
    cost: 0,
    exhaust: true,
    effects: [
      { op: 'gainHeat', amount: 3 },
      { op: 'gainEnergy', amount: 1 },
    ],
    upgrade: {
      name: 'Stoke the Core+',
      effects: [
        { op: 'gainHeat', amount: 3 },
        { op: 'gainEnergy', amount: 2 },
      ],
    },
    flavor: 'Ask it for more. It has never once refused.',
  },

  {
    id: 'kindled_edge',
    name: 'Kindled Edge',
    type: 'attack',
    rarity: 'common',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 8, target: 'enemy' },
      { op: 'gainHeat', amount: 2 },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'damage', amount: 3, target: 'enemy' }],
    },
    upgrade: {
      name: 'Kindled Edge+',
      effects: [
        { op: 'damage', amount: 12, target: 'enemy' },
        { op: 'gainHeat', amount: 2 },
      ],
    },
    flavor: 'Warm metal takes an edge that cold metal argues with.',
  },

  {
    id: 'bank_the_breath',
    name: 'Bank the Breath',
    type: 'skill',
    rarity: 'common',
    archetype: 'guard',
    cost: 0,
    effects: [{ op: 'gainFocus', amount: 1 }],
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'gainFocus', amount: 1 }],
    },
    upgrade: {
      name: 'Bank the Breath+',
      effects: [{ op: 'gainFocus', amount: 2 }],
    },
    flavor: 'Counting is not waiting. It only looks like it.',
  },

  {
    id: 'turn_the_shoulder',
    name: 'Turn the Shoulder',
    type: 'skill',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'block', amount: 3 },
    ],
    upgrade: {
      name: 'Turn the Shoulder+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'block', amount: 6 },
      ],
    },
    flavor: 'The guard and the turn are the same motion, taught twice.',
  },

  {
    id: 'reverse_the_grip',
    name: 'Reverse the Grip',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'gainFocus', amount: 1 },
    ],
    upgrade: {
      name: 'Reverse the Grip+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'gainFocus', amount: 2 },
      ],
    },
    flavor: 'Same blade. Other hand. Everything after it is different.',
  },

  {
    id: 'cross_step',
    name: 'Cross Step',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Cross Step+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'ventHeat', amount: 4 },
      ],
    },
    flavor: 'Out of the line, and cooler for having left it.',
  },

  {
    id: 'sweeping_guard',
    name: 'Sweeping Guard',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    effects: [{ op: 'damage', amount: 3, target: 'allEnemies' }],
    // The same card is a sweep in IAI and a wall in GUARD.
    stanceRider: {
      stance: 'guard',
      effects: [{ op: 'block', amount: 6 }],
    },
    upgrade: {
      name: 'Sweeping Guard+',
      effects: [{ op: 'damage', amount: 5, target: 'allEnemies' }],
      stanceRider: {
        stance: 'guard',
        effects: [{ op: 'block', amount: 9 }],
      },
    },
    flavor: 'Everything in reach, and then back where it started.',
  },

  {
    id: 'coolant_burst',
    name: 'Coolant Burst',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    // Pays for the sweep by giving the gauge back. The hotter you are, the more
    // this card is worth — which is the opposite of every other Heat card.
    effects: [
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 2,
        then: [{ op: 'damage', amount: 2, target: 'allEnemies' }],
      },
      { op: 'ventHeat', amount: 4 },
    ],
    upgrade: {
      name: 'Coolant Burst+',
      effects: [
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 2,
          then: [{ op: 'damage', amount: 3, target: 'allEnemies' }],
        },
        { op: 'ventHeat', amount: 6 },
      ],
    },
    flavor: 'Everything the loop was holding, released at once and outward.',
  },

  {
    id: 'rusting_wind',
    name: 'Rusting Wind',
    type: 'attack',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 2,
    /* Low damage, but the Rust runs on every one of them at once — the sweep
       that gets better the more things there are to hit.

       2 and 3, down from 3 and 4. Written when Rust was 1 damage a stack; at 2
       this was 6 unblockable a turn on every enemy on the board from one card,
       and it climbs, because a stack decays a turn and this lands three. */
    effects: [
      { op: 'damage', amount: 3, target: 'allEnemies' },
      { op: 'applyStatus', status: RUST, stacks: 2, target: 'allEnemies' },
    ],
    upgrade: {
      name: 'Rusting Wind+',
      effects: [
        { op: 'damage', amount: 5, target: 'allEnemies' },
        { op: 'applyStatus', status: RUST, stacks: 3, target: 'allEnemies' },
      ],
    },
    flavor: 'It does not cut. It starts something that finishes on its own.',
  },

  /* ---- the second batch ----
     Stance changing had one shape: change it and get a small thing. These are
     the versions where the change is the cost of something larger. */

  {
    id: 'weight_shift',
    name: 'Weight Shift',
    type: 'skill',
    /* Epic. A free Energy is the strongest line a 0-cost can print, and the
       stance change it is priced against is a cost only to a deck that cared
       where it was standing — which, for the deck that wants this card, is
       none of them. The Burn is what keeps it honest; the tier is what keeps
       it out of every second reward screen. */
    rarity: 'epic',
    archetype: 'neutral',
    cost: 0,
    exhaust: true,
    /* The Heat is what it costs. A free Energy for a stance change was a cost
       only to a deck that cared where it was standing — which, for the deck
       that wants this card, is none of them. Two Heat is a quarter of the gauge
       for a quarter of a turn, which is a trade you have to actually think
       about at 6. */
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'gainEnergy', amount: 1 },
      { op: 'gainHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Weight Shift+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'gainEnergy', amount: 1 },
        { op: 'gainHeat', amount: 2 },
        { op: 'draw', amount: 1 },
      ],
    },
    flavor: 'Once a fight the footing is free. After that you are paying for it.',
  },

  {
    id: 'the_turning',
    name: 'The Turning',
    type: 'skill',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'cycleStance', direction: 1 },
      { op: 'draw', amount: 2 },
      { op: 'gainFocus', amount: 1 },
    ],
    upgrade: {
      name: 'The Turning+',
      effects: [
        { op: 'cycleStance', direction: 1 },
        { op: 'draw', amount: 2 },
        { op: 'gainFocus', amount: 2 },
      ],
    },
    flavor: 'The whole art, if you ask the wrong teacher, is knowing when.',
  },

  {
    id: 'breath_count',
    name: 'Breath Count',
    type: 'skill',
    rarity: 'common',
    archetype: 'iai',
    cost: 1,
    /* Vent 2, not 1. Two is the threshold that sheds a stack of Scald, so a
       common in the IAI pool is a real answer to the status IAI decks meet most
       — and a vent of 1 on a Focus card was a rounding error you never chose it
       for. */
    effects: [
      { op: 'gainFocus', amount: 2 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Breath Count+',
      effects: [
        { op: 'gainFocus', amount: 3 },
        { op: 'ventHeat', amount: 3 },
      ],
    },
    flavor: 'Four in, four held, four out. The rest of it is just fighting.',
  },

  {
    id: 'chained_draw',
    name: 'Chained Draw',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    effects: [
      { op: 'damage', amount: 4, target: 'enemy' },
      { op: 'draw', amount: 1 },
    ],
    stanceRider: {
      stance: 'iai',
      effects: [{ op: 'gainFocus', amount: 1 }],
    },
    upgrade: {
      name: 'Chained Draw+',
      effects: [
        { op: 'damage', amount: 6, target: 'enemy' },
        { op: 'draw', amount: 1 },
      ],
      stanceRider: {
        stance: 'iai',
        effects: [{ op: 'gainFocus', amount: 2 }],
      },
    },
    flavor: 'One motion that has not finished when the next one starts.',
  },
];
