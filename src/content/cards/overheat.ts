/* OVERHEAT cards — build to build.
 *
 * The archetype that reads the pressure gauge as a resource instead of a
 * threat. Every one of these is better the closer you are to the thing that
 * kills you, which is the whole design in one archetype: your best cards
 * actively build toward your death.
 */

import type { CardDef } from '../../engine/types.ts';
import { SCALD, VULNERABLE } from '../statuses.ts';

export const OVERHEAT_CARDS: readonly CardDef[] = [
  {
    id: 'purge_cycle',
    name: 'Purge Cycle',
    type: 'skill',
    rarity: 'common',
    archetype: 'overheat',
    cost: 0,
    /* Two, not three. A free 3-vent answered a whole turn of IAI and half an
       overheat, which made the gauge something you cleaned up rather than
       something you played around — and the upgrade at 5 wiped the board. */
    effects: [{ op: 'ventHeat', amount: 2 }],
    upgrade: { name: 'Purge Cycle+', effects: [{ op: 'ventHeat', amount: 4 }] },
    flavor: 'Open every port and let the dark have it.',
  },

  {
    id: 'reactor_lance',
    name: 'Reactor Lance',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    /* Base up to 6. The scaling half only pays once the gauge is running, so
       the floor is what the card is worth on the turn you draw it cold — and at
       5 for one Energy that floor was under the commons. */
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'scaleWith',
        source: 'currentHeat',
        per: 2,
        then: [{ op: 'damage', amount: 2, target: 'enemy' }],
      },
    ],
    /* The upgrade buys the SLOPE, not the floor. Three a step against two means
       the upgraded card is worth more the hotter you are, which is the axis the
       archetype is actually playing on — a bigger base would have made it a
       better cold draw, which is the one thing this card is not for. */
    upgrade: {
      name: 'Reactor Lance+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'scaleWith',
          source: 'currentHeat',
          per: 2,
          then: [{ op: 'damage', amount: 3, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Point the problem at somebody else.',
  },

  {
    id: 'criticality',
    name: 'Criticality',
    type: 'attack',
    rarity: 'epic',
    archetype: 'overheat',
    cost: 2,
    effects: [
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'damage', amount: 24, target: 'enemy' }],
        else: [{ op: 'damage', amount: 10, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Criticality+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 6 },
          then: [{ op: 'damage', amount: 30, target: 'enemy' }],
          else: [{ op: 'damage', amount: 13, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Two turns of restraint, spent in one.',
  },

  {
    id: 'runaway_bloom',
    name: 'Runaway Bloom',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 8, target: 'allEnemies' },
      { op: 'gainHeat', amount: 3 },
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 8 },
        then: [{ op: 'damage', amount: 10, target: 'allEnemies' }],
      },
    ],
    upgrade: {
      name: 'Runaway Bloom+',
      effects: [
        { op: 'damage', amount: 10, target: 'allEnemies' },
        { op: 'gainHeat', amount: 3 },
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 8 },
          then: [{ op: 'damage', amount: 13, target: 'allEnemies' }],
        },
      ],
    },
    flavor: 'The cutter was never rated for this. Neither were you.',
  },

  /* ---- the second batch ----
     Scald had only ever been something enemies did to you. It is a debuff on
     the PLAYER by construction — enemies have no gauge — so a card that applies
     it to yourself is a Heat cost you pay on the instalment plan, which is a
     different decision from a Heat cost you pay now. */

  {
    id: 'deferred_burn',
    name: 'Deferred Burn',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'damage', amount: 13, target: 'enemy' },
      { op: 'applyStatus', status: SCALD, stacks: 2, target: 'self' },
    ],
    upgrade: {
      name: 'Deferred Burn+',
      effects: [
        { op: 'damage', amount: 17, target: 'enemy' },
        { op: 'applyStatus', status: SCALD, stacks: 2, target: 'self' },
      ],
    },
    flavor: 'The reactor will bring this up again. It always does.',
  },

  {
    id: 'blowdown',
    name: 'Blowdown',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'overheat',
    cost: 1,
    effects: [
      { op: 'ventHeat', amount: 5 },
      { op: 'draw', amount: 2 },
    ],
    upgrade: {
      name: 'Blowdown+',
      effects: [
        { op: 'ventHeat', amount: 6 },
        { op: 'draw', amount: 3 },
      ],
    },
    flavor: 'Everything out at once, and a moment to think in the quiet after.',
  },

  {
    id: 'thermal_lance',
    name: 'Thermal Lance',
    type: 'attack',
    rarity: 'epic',
    archetype: 'overheat',
    cost: 2,
    effects: [
      { op: 'damage', amount: 12, target: 'enemy' },
      { op: 'gainHeat', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'heatAtLeast', value: 6 },
        then: [{ op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Thermal Lance+',
      effects: [
        { op: 'damage', amount: 16, target: 'enemy' },
        { op: 'gainHeat', amount: 2 },
        {
          op: 'conditional',
          when: { kind: 'heatAtLeast', value: 5 },
          then: [{ op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Hot enough and the armour stops being the point.',
  },

  {
    id: 'overpressure',
    name: 'Overpressure',
    type: 'skill',
    rarity: 'legendary',
    archetype: 'overheat',
    cost: 0,
    exhaust: true,
    /* Two Energy for six Heat. Three was a whole extra turn for three quarters
       of the gauge, which is a trade you take every time it is in your hand —
       and a card you always play is not a decision. Two is most of a turn for
       most of the gauge, which is. Exhausts, because a deck that can do this
       twice is not playing the gauge at all. */
    /* Four Heat and two Scald rather than six Heat flat.
     *
     * Six was most of the gauge in one lump, which an overheat deck could
     * simply vent back. Four plus two Scald is less on the moment and more over
     * the fight: the Scald keeps charging until you spend a real vent on it, so
     * the card costs you cards as well as gauge. Same trade, paid on a clock. */
    effects: [
      { op: 'gainEnergy', amount: 2 },
      { op: 'gainHeat', amount: 4 },
      { op: 'applyStatus', status: SCALD, stacks: 2, target: 'self' },
    ],
    /* The upgrade buys the third Energy and keeps the whole six Heat.
     *
       It used to buy the Heat down to four instead, which made the upgraded
       card strictly safer and left the base card's own argument — three
       quarters of the gauge for most of a turn — as the thing you upgraded AWAY
       from. Three for six is the trade the card was always describing, taken
       one step further: it is a whole extra turn, and it puts you two points
       off the ceiling to get it. */
    upgrade: {
      name: 'Overpressure+',
      effects: [
        { op: 'gainEnergy', amount: 3 },
        { op: 'gainHeat', amount: 4 },
        { op: 'applyStatus', status: SCALD, stacks: 2, target: 'self' },
      ],
    },
    flavor: 'Every warning at once, and about four seconds of being unstoppable.',
  },
];
