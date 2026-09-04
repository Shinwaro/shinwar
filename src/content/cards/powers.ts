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
import { OVERCLOCK, SCALD, STRENGTH, TEMPERED, WEAK } from '../statuses.ts';

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
    /* The Energy is the price now, and the gauge is left alone.
     *
     * It used to cost one Energy and four Heat, which is a price that lands on
     * a resource the card has nothing to do with: a GUARD armour card that
     * shoved the reactor most of the way to an overheat belonged to the Heat
     * archetype by accident. Two Energy is most of a turn, which is the honest
     * cost of permanent armour and one every deck can read without also
     * carrying a vent. */
    cost: 2,
    exhaust: true,
    /* Permanent armour, and a point of Weak for having stopped moving.
       Settling is the whole image of the card — you decide where you are and
       everything after that is easier — so paying for it in swing rather than
       in Heat is the cost that matches the picture.

       Two stacks, which is Weak's cap — so the turn you settle, you swing at
       half. One was a rounding error against permanent armour: 25% off one
       turn of attacks, on a card the GUARD deck plays while it is not
       attacking anyway. At the cap it is a real turn given up, and player
       debuffs shed at the end of the round applied, so it is exactly one. */
    effects: [
      { op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' },
      { op: 'applyStatus', status: WEAK, stacks: 2, target: 'self' },
    ],
    upgrade: {
      name: 'Settle the Stance+',
      effects: [
        { op: 'applyStatus', status: TEMPERED, stacks: 3, target: 'self' },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'self' },
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
    /* Two Energy and TWO cards back. A Power spends the turn it is played on,
       and at one Energy this one spent a third of a turn and gave nothing back
       — so it was strong on turn one and unplayable on every turn you actually
       needed the Strength. Two cards is what lets you cast it mid-fight and
       still have a turn afterwards, which is the difference between a Power you
       open with and one you can play when the fight asks for it.

       One stack rather than two: the draw is doing more of the work now, and
       the upgrade buys the second stack instead of a third. */
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'applyStatus', status: STRENGTH, stacks: 1, target: 'self' },
      { op: 'draw', amount: 2 },
    ],
    upgrade: {
      name: 'Sect Discipline+',
      effects: [
        { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        { op: 'draw', amount: 2 },
      ],
    },
    flavor: 'Forty years of the same four movements, and the fifth one is free.',
  },

  {
    /* Strength, but only once the fight has gone wrong.
     *
     * The other side of Annealing Run's coin: that one is a common that pays
     * armour under half, this is a legendary that pays the raise. Both do
     * nothing at all while you are winning, and that is the whole shape of the
     * card — a legendary you cannot open with, cannot plan around, and cannot
     * cash until the fight has already turned. A dead draw at full hull is the
     * price of two Strength for two Energy, which is otherwise the best rate in
     * the game.
     *
     * The upgrade buys the ENERGY, not more Strength. At two Energy this is
     * most of the turn you are having while losing, which is exactly the turn
     * with no Energy to spare; at one it is a card you can play and still act
     * on. That is worth more than a third stack and it keeps the condition —
     * and therefore the identity — intact.
     */
    id: 'past_the_line',
    name: 'Past the Line',
    type: 'power',
    rarity: 'legendary',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 50 },
        then: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
      },
    ],
    upgrade: {
      name: 'Past the Line+',
      cost: 1,
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 50 },
          then: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
        },
      ],
    },
    flavor: 'The forms are for before. This is the one they taught for after.',
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
    /* Pays only when the fight is going badly, and costs no Heat at all.
     *
     * It was three Tempered flat for three Heat — the same armour whether you
     * were whole or nearly dead, bought with the resource that kills you. Then
     * it read the hull but paid on both sides of the line, which made the
     * condition decoration: you always got armour, sometimes more of it.
     *
     * One stack under half and NOTHING above it. A common is the tier where a
     * dead draw is affordable, and a card that does nothing while you are
     * winning is a real decision about whether to carry it — which is more than
     * "the same card, slightly better when losing" ever asked. */
    effects: [
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 50 },
        then: [{ op: 'applyStatus', status: TEMPERED, stacks: 1, target: 'self' }],
      },
    ],
    upgrade: {
      name: 'Annealing Run+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 50 },
          then: [{ op: 'applyStatus', status: TEMPERED, stacks: 2, target: 'self' }],
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
    /* Scald, not a lump of Heat — and this is the clearest case of the swap.
     *
     * Five Heat once was a cost the overheat deck was happy to pay and often
     * wanted: it is a card that hands you Energy, and Energy is what a hot deck
     * spends on getting hotter. Three Scald is Heat WITH INTEREST — three a
     * turn, every turn, and it never decays. It has to be vented off two at a
     * time by cards you would rather have spent on damage.
     *
     * So the price now scales with the thing the card gives you: the longer you
     * enjoy the extra Energy, the more gauge it has quietly charged you. That
     * is the bargain the flavour always claimed. */
    effects: [
      { op: 'applyStatus', status: OVERCLOCK, stacks: 3, target: 'self' },
      { op: 'applyStatus', status: SCALD, stacks: 3, target: 'self' },
    ],
    /* The upgrade buys the extra turn and nothing off the price. The Scald is
       the card's identity now, and a version that carried less of it would be a
       different card rather than a better one. */
    upgrade: {
      name: 'Overclock the Core+',
      effects: [
        { op: 'applyStatus', status: OVERCLOCK, stacks: 4, target: 'self' },
        { op: 'applyStatus', status: SCALD, stacks: 3, target: 'self' },
      ],
    },
    flavor: 'The limiter is a suggestion written by somebody who expected to grow old.',
  },
];
