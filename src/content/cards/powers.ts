/* Powers — cards that change the rest of the fight rather than this turn.
 *
 * A power here is a card that applies a lasting buff to you and burns. There
 * is no separate "powers pile" and there does not need to be: a card that
 * exhausts after granting something that outlives the turn already behaves the
 * way a power behaves, and inventing a fourth place a card can live would be a
 * whole system to make one word literally true.
 *
 * `type: 'power'` earns its place anyway, because it tells the player what
 * kind of thing they are holding before they read the numbers. The type has
 * been in `CardType` since M1 with nothing using it.
 *
 * **Why these exist.** Strength was the only lasting buff in the game, so every
 * card that wanted to be a power was the same card with a different number on
 * it. Tempered and Overclock are the other two axes a fight actually runs on —
 * what reaches you, and how many cards a turn you get to play — and neither
 * needed machinery worth the name. Tempered is the existing `damageTakenMult`
 * pointed the other way, capped by the same floor that caps Weak.
 *
 * They are priced as a turn spent buying later turns. That is a bad trade in a
 * short fight and the whole game in a long one, which is exactly the decision
 * a power should be.
 */

import type { CardDef } from '../../engine/types.ts';
import { OVERCLOCK, STRENGTH, TEMPERED } from '../statuses.ts';

export const POWER_CARDS: readonly CardDef[] = [
  {
    id: 'settle_the_stance',
    name: 'Settle the Stance',
    type: 'power',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 1,
    exhaust: true,
    effects: [{ op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' }],
    upgrade: {
      name: 'Settle the Stance+',
      effects: [{ op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' }],
    },
    flavor: 'Stop moving. Decide where you are. Everything after that is easier.',
  },

  {
    id: 'sect_discipline',
    name: 'Sect Discipline',
    type: 'power',
    rarity: 'rare',
    archetype: 'neutral',
    cost: 1,
    exhaust: true,
    effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
    upgrade: {
      name: 'Sect Discipline+',
      effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' }],
    },
    flavor: 'Forty years of the same four movements, and the fifth one is free.',
  },

  {
    id: 'annealing_run',
    name: 'Annealing Run',
    type: 'power',
    rarity: 'rare',
    archetype: 'overheat',
    cost: 1,
    exhaust: true,
    // Heat now, hardness later. The gauge is the price of the whole card.
    effects: [
      { op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' },
      { op: 'gainHeat', amount: 3 },
    ],
    upgrade: {
      name: 'Annealing Run+',
      effects: [
        { op: 'applyStatus', status: TEMPERED, stacks: 4, target: 'self' },
        { op: 'gainHeat', amount: 2 },
      ],
    },
    flavor: 'Run it hot, cool it slow, and it comes out of the other side harder than it went in.',
  },

  {
    id: 'overclock_the_core',
    name: 'Overclock the Core',
    type: 'power',
    rarity: 'epic',
    archetype: 'overheat',
    cost: 2,
    exhaust: true,
    /* The expensive one, and the only card in the game that changes how many
       cards a turn you get to play. Two Energy and five Heat is most of a turn
       and most of the gauge — it buys three turns of being a full Energy
       faster, and the fight has to still be going for that to have been worth
       it. A deck that can do this on turn one is a deck that overheats on turn
       four, which is the decision. */
    effects: [
      { op: 'applyStatus', status: OVERCLOCK, stacks: 3, target: 'self' },
      { op: 'gainHeat', amount: 5 },
    ],
    /* The upgrade buys a turn AND a degree off the price. Four turns of an
       extra Energy for 4 Heat is the same card asking for slightly less of the
       gauge, which is where its whole cost lives. */
    upgrade: {
      name: 'Overclock the Core+',
      effects: [
        { op: 'applyStatus', status: OVERCLOCK, stacks: 4, target: 'self' },
        { op: 'gainHeat', amount: 4 },
      ],
    },
    flavor: 'The limiter is a suggestion written by somebody who expected to grow old.',
  },
];
