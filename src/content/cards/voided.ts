/* Voided — the game's word for a curse.
 *
 * A card you did not choose, cannot play, and have to pay a Safe Planet or a
 * Station to be rid of. It has no upgrade and no effects, and the validator
 * enforces both: a curse you could improve is a card you would eventually
 * want, and a curse that does something is a card. Doing nothing, forever, is
 * the entire mechanic.
 *
 * **What they are for.** Several Anomalies offer something for nothing —
 * money, a relic, a way out — and "for nothing" is not a decision. A Voided
 * card is a cost the reward screen cannot express, because the cost is
 * *carrying it for the rest of the run*: a slot in every hand it turns up in,
 * for an hour, and the removal fee to end that. It is the only price in the
 * game that gets worse the longer you leave it.
 *
 * **Why they are not all identical.** They are mechanically identical — that
 * is the point — but each one is the residue of a specific choice, and the
 * name is how you remember which. A deck with Blood Price in it is a deck that
 * took the money at the Wrecking Field, and you will know that every time you
 * draw it.
 *
 * `innate` on two of them is the harshest version: guaranteed in your opening
 * hand, every fight, rather than merely somewhere in the deck. Reserved for
 * the two options that offer the most — those are worth a card that is
 * *reliably* in the way rather than statistically in the way.
 */

import type { CardDef } from '../../engine/types.ts';

/** No cost that matters — nothing can pay to play one. Kept at 0 so no screen
 *  ever shows a number implying otherwise. */
export const VOIDED_CARDS: readonly CardDef[] = [
  {
    id: 'voided_blood_price',
    name: 'Blood Price',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    effects: [],
    flavor: 'You did the arithmetic out loud and nobody stopped you.',
  },
  {
    id: 'voided_the_debt',
    name: 'The Debt',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    effects: [],
    flavor: 'Signed with somebody else’s hand, and it still counts.',
  },
  {
    id: 'voided_dead_weight',
    name: 'Dead Weight',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    effects: [],
    flavor: 'You kept it because throwing it out would have meant admitting something.',
  },
  {
    id: 'voided_the_witness',
    name: 'The Witness',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    // Innate: it is in your hand at the start of every fight. Some things you
    // do not get to file away and forget about until later.
    innate: true,
    effects: [],
    flavor: 'They saw the whole thing and you let them go. That was the mistake.',
  },
  {
    id: 'voided_scorched_lane',
    name: 'Scorched Lane',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    innate: true,
    effects: [],
    flavor: 'Everyone behind you needed that route too.',
  },
  {
    id: 'voided_the_name',
    name: 'The Name You Gave',
    type: 'voided',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    exclusive: true,
    effects: [],
    flavor: 'It was not yours to trade and it was the easiest thing you have ever done.',
  },
];
