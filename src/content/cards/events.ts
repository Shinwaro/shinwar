/* Cards you can only be given.
 *
 * Every card in here is the payoff of one specific Anomaly or Thread, and is
 * marked `exclusive` so it never turns up in a reward screen or a shop. A card
 * that is the whole point of a decision stops being one the moment you can just
 * buy it two nodes later.
 */

import type { CardDef } from '../../engine/types.ts';
import { VULNERABLE } from '../statuses.ts';

export const EVENT_CARDS: readonly CardDef[] = [
  {
    id: 'vareth_chitin_edge',
    name: 'Vareth Chitin Edge',
    type: 'attack',
    rarity: 'rare',
    archetype: 'guard',
    cost: 1,
    exclusive: true,
    effects: [
      { op: 'damage', amount: 8, target: 'enemy' },
      { op: 'block', amount: 4 },
    ],
    upgrade: {
      name: 'Vareth Chitin Edge+',
      effects: [
        { op: 'damage', amount: 10, target: 'enemy' },
        { op: 'block', amount: 6 },
      ],
    },
    flavor: 'It was going to be armour. It is a very good knife instead.',
  },

  {
    id: 'vareth_hatchling',
    name: 'Vareth Hatchling',
    type: 'attack',
    // Epic for the same reason as Starfall. It is a Thread payoff, so it was
    // never in the reward pool — but a run could hold it AND a Reliquary card,
    // and that is exactly the thing the gate exists to prevent.
    rarity: 'epic',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    // Innate: it is there at the start of every fight, the way a companion is.
    // The closest the deck can get to an ally without an ally system.
    innate: true,
    // A legendary you are handed once, for free, every fight. At 5/3 it was a
    // common with a story attached.
    effects: [
      { op: 'damage', amount: 9, target: 'enemy' },
      { op: 'block', amount: 6 },
    ],
    upgrade: {
      name: 'Vareth Hatchling+',
      effects: [
        { op: 'damage', amount: 13, target: 'enemy' },
        { op: 'block', amount: 9 },
      ],
    },
    flavor: 'It has decided you are the shape a parent is.',
  },

  {
    id: 'dead_reckoning',
    name: 'Dead Reckoning',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    /* Exhausts. Two cards and a vent for nothing is a card that is never wrong
       to play, and a card that is never wrong to play is not a decision — it
       was simply the best thing in every hand it appeared in.

       The upgrade buys the exhaust back rather than a bigger number, which is
       the more interesting purchase: the card stays exactly as good and becomes
       something the deck can be built around. */
    exhaust: true,
    effects: [
      { op: 'draw', amount: 2 },
      { op: 'ventHeat', amount: 2 },
    ],
    upgrade: {
      name: 'Dead Reckoning+',
      exhaust: false,
      effects: [
        { op: 'draw', amount: 2 },
        { op: 'ventHeat', amount: 2 },
      ],
    },
    flavor: 'No beacons, no chart. Speed, heading, and the nerve to trust both.',
  },

  {
    id: 'syndicate_mark',
    name: 'Syndicate Mark',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    exclusive: true,
    /* Vulnerable caps at 2 stacks. This handed you the whole cap for 1 Energy
       AND dealt damage doing it, so the correct opening was always "Mark, then
       everything else at double" — one card that decided the turn before the
       turn started. One stack is half the cap: still the best setup in the
       game at the price, and now the second stack has to come from somewhere.

       The upgrade's third stack was doing nothing at all — the cap ate it — so
       it buys the cap itself instead, which is what an upgrade should do. */
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
    ],
    upgrade: {
      name: 'Syndicate Mark+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
      ],
    },
    flavor: 'They paint the ones they intend to come back for.',
  },
];
