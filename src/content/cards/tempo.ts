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
import { VULNERABLE } from '../statuses.ts';

export const TEMPO_CARDS: readonly CardDef[] = [
  {
    id: 'pressure_release',
    name: 'Pressure Release',
    type: 'skill',
    rarity: 'common',
    archetype: 'overheat',
    cost: 0,
    effects: [
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 5 },
        then: [{ op: 'gainEnergy', amount: 1 }],
        else: [{ op: 'gainHeat', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Pressure Release+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 4 },
          then: [{ op: 'gainEnergy', amount: 2 }],
          else: [{ op: 'gainHeat', amount: 2 }],
        },
      ],
    },
    flavor: 'Let it out through something useful on the way past.',
  },

  {
    id: 'runaway_intake',
    name: 'Runaway Intake',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 0,
    effects: [
      { op: 'gainEnergy', amount: 2 },
      { op: 'gainHeat', amount: 3 },
      { op: 'draw', amount: 1 },
    ],
    upgrade: {
      name: 'Runaway Intake+',
      effects: [
        { op: 'gainEnergy', amount: 3 },
        { op: 'gainHeat', amount: 3 },
        { op: 'draw', amount: 1 },
      ],
    },
    flavor: 'Everything the reactor has, right now, and the bill at the end of the turn.',
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
        then: [
          { op: 'draw', amount: 2 },
          { op: 'gainEnergy', amount: 1 },
        ],
      },
    ],
    upgrade: {
      name: 'Open the Line+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'cardsPlayedThisTurnAtLeast', value: 2 },
          then: [
            { op: 'draw', amount: 2 },
            { op: 'gainEnergy', amount: 1 },
          ],
        },
      ],
    },
    flavor: 'The third move is the one that shows you the fourth.',
  },

  {
    id: 'long_form',
    name: 'Long Form',
    type: 'attack',
    rarity: 'rare',
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
    rarity: 'rare',
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
      { op: 'gainFocus', amount: 1 },
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
        { op: 'gainFocus', amount: 1 },
      ],
    },
    flavor: 'Every motion before this one was also the guard.',
  },

  {
    id: 'flashpoint',
    name: 'Flashpoint',
    type: 'attack',
    rarity: 'epic',
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
    cost: 0,
    exhaust: true,
    effects: [
      { op: 'draw', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'handSizeAtLeast', value: 5 },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Second Wind+',
      effects: [
        { op: 'draw', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'handSizeAtLeast', value: 4 },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'You were not tired. You were between things.',
  },
];
