/* The Reliquary — the one beat every run passes through.
 *
 * A full row in the middle of Act 2, which is the middle of the run. Not a
 * node you can be lucky or unlucky about: every route crosses it, and what you
 * take out of it is the only legendary card the run will ever hold.
 *
 * **Why it exists.** The top two tiers used to arrive by die roll, which made
 * the best cards in the game a thing that happened *to* a run rather than
 * something a run was about. Worse, a legendary is by definition the card you
 * build around — handing it out at a random reward screen in Act 3 is handing
 * it out after the deck is already finished. Halfway is the last point where a
 * card can still change what the rest of the run is.
 *
 * **Why it is about the sect.** The ronin is the last of a dead order. The
 * strongest thing the game can hand them is not a better sword, it is the part
 * of their own training they were never taught — and the price of it is
 * deciding, once, which kind of ronin they are going to be. Every option here
 * is a form the order kept back, and taking one means the other three stay in
 * the box.
 *
 * The Thread on the last option is not decoration: the validator requires an
 * Anomaly to defer at least one consequence, and taking the whole vault
 * genuinely should follow you.
 */

import type { EventDef } from '../../engine/types.ts';

export const RELIQUARY_EVENT_ID = 'the_reliquary';

export const RELIQUARY_EVENT: EventDef = {
  id: RELIQUARY_EVENT_ID,
  name: 'The Reliquary',
  // Pinned to its row by the map generator. It must never turn up anywhere
  // else, or "one per run, in the middle" stops being true.
  pinnedOnly: true,
  acts: [2],
  body:
    'A sect vault, keyed to a hand shape you have not made since you were nineteen, tumbled into ' +
    'a rock nobody has any reason to visit. Inside are four sealed forms — the ones the order ' +
    'taught to nobody, on the reasoning that a technique everyone knows is a technique everyone ' +
    'can answer. The seals are single-use. You are the last person alive who can open any of them, ' +
    'and you can open one.',
  options: [
    {
      id: 'the_sword',
      label: 'The whole sword',
      detail:
        'The form the order abandoned for being indefensible: everything, at one person, at once. ' +
        'You were told about it twice and shown it never.',
      effects: [{ op: 'card', cardId: 'the_whole_sword' }],
      risk: 'None',
      payoff: 'Permanent, specific',
    },
    {
      id: 'the_stillness',
      label: 'The stillness',
      detail:
        'Not a guard. A refusal to be anywhere the blow is going, held long enough that the ' +
        'reactor cools and the room reconsiders.',
      effects: [{ op: 'card', cardId: 'absolute_zero' }],
      risk: 'None',
      payoff: 'Permanent, specific',
    },
    {
      id: 'the_severing',
      label: 'The severing',
      detail:
        'How to take the one at the front so cleanly that the rest of it stops being a formation. ' +
        'The order used it once, on their own.',
      effects: [{ op: 'card', cardId: 'cut_the_line' }],
      risk: 'None',
      payoff: 'Permanent, specific',
    },
    {
      id: 'the_names',
      label: 'The names',
      detail:
        'Not a technique. Every member of the order, in order, and what each of them was for. ' +
        'Reading it costs you an hour and something you will not get back.',
      effects: [
        { op: 'card', cardId: 'the_dead_sect' },
        { op: 'health', amount: -12 },
        { op: 'setThread', threadId: 'sect_rites' },
      ],
      risk: 'The body',
      payoff: 'Permanent, specific',
    },
    {
      id: 'leave',
      label: 'Reseal the vault',
      detail:
        'It kept for forty years without you. Nothing says it needs you now.',
      effects: [],
      isLeave: true,
      risk: 'None',
      payoff: 'None',
    },
  ],
};
