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
    /* Epic. Permanent armour is the most durable thing a single card can buy —
       it does not fall off, it does not need re-buying, and it compounds with
       every other reduction in the deck. The four Heat is a real price on the
       turn you pay it and no price at all by turn six, which is an uncommon's
       shape of decision attached to an epic's shape of payoff. */
    rarity: 'epic',
    archetype: 'guard',
    cost: 1,
    exhaust: true,
    /* The Heat is the price. Permanent armour for one Energy and nothing else
       was a card with no argument against it; four Heat means taking it early
       costs you the top of the gauge for the rest of the fight, which is
       exactly the decision an uncommon should be asking. */
    effects: [
      { op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' },
      { op: 'gainHeat', amount: 4 },
    ],
    upgrade: {
      name: 'Settle the Stance+',
      effects: [
        { op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' },
        { op: 'gainHeat', amount: 4 },
      ],
    },
    flavor: 'Stop moving. Decide where you are. Everything after that is easier.',
  },

  {
    id: 'sect_discipline',
    name: 'Sect Discipline',
    type: 'power',
    rarity: 'epic',
    archetype: 'neutral',
    /* Two Energy and a card back. A Power spends the turn it is played on, and
       at one Energy this one spent a third of a turn and gave nothing back —
       so it was strong on turn one and unplayable on every turn you actually
       needed the Strength. The draw is what lets you cast it mid-fight. */
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
      { op: 'draw', amount: 1 },
    ],
    upgrade: {
      name: 'Sect Discipline+',
      effects: [
        { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        { op: 'draw', amount: 1 },
      ],
    },
    flavor: 'Forty years of the same four movements, and the fifth one is free.',
  },

  {
    id: 'annealing_run',
    name: 'Annealing Run',
    type: 'power',
    /* Down to common. It reads as an epic and measures as a filler: the payoff
       is gated on already being in trouble, which means the runs that most want
       it are the runs that were losing anyway, and the ones that are winning
       draw a dead card. A conditional that only pays in the bad case belongs
       where a dead draw is affordable. */
    rarity: 'common',
    archetype: 'overheat',
    cost: 1,
    exhaust: true,
    /* Pays more the worse the fight is going, and costs no Heat at all.
     *
     * It was three Tempered flat for three Heat — the same armour whether you
     * were whole or nearly dead, bought with the resource that kills you. Now
     * the gauge is untouched and the number reads your hull: two stacks when
     * you are under half, one when you are not. Settle the Stance is the
     * version that pays Heat for a flat figure; this is the version that pays
     * nothing and asks how the fight is going. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 50 },
        then: [{ op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' }],
        else: [{ op: 'applyStatus', status: TEMPERED, stacks: 1, target: 'self' }],
      },
    ],
    upgrade: {
      name: 'Annealing Run+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 50 },
          then: [{ op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' }],
          else: [{ op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' }],
        },
      ],
    },
    flavor: 'Run it hot, cool it slow, and it comes out of the other side harder than it went in.',
  },

  {
    id: 'overclock_the_core',
    name: 'Overclock the Core',
    type: 'power',
    rarity: 'legendary',
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
