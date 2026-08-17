/* The Thread pool.
 *
 * A Thread is a promise the run makes to itself: you took a deal, and the bill
 * or the reward arrives somewhere you have already forgotten about. It is the
 * cheapest mechanism there is for producing a run you can describe afterwards
 * in a sentence, which is the whole target.
 *
 * Rules the content validator enforces, so they cannot drift:
 *
 *   - Roughly 30% positive, 40% mixed, 30% costly. If Threads are only
 *     punishments, players stop engaging with events, and then the events stop
 *     mattering too.
 *   - Every Thread has a `description` (what the Manifest shows) and an `omen`
 *     (the category of what is coming). Neither may be blank. The player must
 *     always be able to see that they are Marked — that is what makes the
 *     reprisal feel earned rather than random.
 *
 * `trigger.count` is in nodes entered since the Thread was set. Act 1 is 15
 * rows, so 4-6 lands the payoff inside the same act while leaving enough gap
 * that it arrives somewhere else.
 */

import type { ThreadDef } from '../engine/types.ts';

export const THREAD_DEFS: readonly ThreadDef[] = [
  /* ---- mixed: a real cost now, a real payoff later ---- */
  {
    id: 'the_clutch',
    name: 'The Clutch',
    description: 'You are carrying the last viable egg of a dying species.',
    tone: 'mixed',
    omen: 'It is warm, and it is counting down to something.',
    trigger: { kind: 'nodes', count: 5 },
    payoff: [
      { op: 'card', cardId: 'vareth_hatchling' },
      { op: 'health', amount: 15 },
    ],
  },
  {
    id: 'coolant_leak',
    name: 'Coolant Leak',
    description: 'A seam you welded shut instead of replacing. It is holding. It is not fixed.',
    tone: 'mixed',
    omen: 'It will fail somewhere. What it takes with it is the question.',
    trigger: { kind: 'nodes', count: 4 },
    payoff: [
      { op: 'health', amount: -7 },
      { op: 'alloy', amount: 140 },
    ],
  },

  /* ---- positive: the ones that make the pool worth engaging with ---- */
  {
    id: 'navigators_favour',
    name: "Navigator's Favour",
    description: 'A navigator you did not leave to die. They said they would find you.',
    tone: 'positive',
    omen: 'Somebody out here owes you, and they keep their books.',
    trigger: { kind: 'nodes', count: 5 },
    payoff: [{ op: 'alloy', amount: 130 }],
  },
  {
    id: 'sect_rites',
    name: 'The Rites',
    description: 'You knelt at a shrine of your own dead order and said the whole thing through.',
    tone: 'positive',
    omen: 'Something you were taught is coming back to you.',
    trigger: { kind: 'nodes', count: 4 },
    payoff: [
      { op: 'upgradeRandomCard' },
      { op: 'upgradeRandomCard' },
      { op: 'health', amount: 10 },
    ],
  },

  /* ---- costly: the bills ---- */
  {
    id: 'marked',
    name: 'Marked',
    description: 'The Vareth know your ship. They are slower than you and they do not stop.',
    tone: 'costly',
    omen: 'Something is following your heading.',
    trigger: { kind: 'nodes', count: 4 },
    // The reprisal takes the node it lands on, and pays elite money for it.
    payoff: [{ op: 'ambush', tier: 'elite' }],
  },
  {
    id: 'yard_debt',
    name: 'Yard Debt',
    description: 'You signed for work you had not paid for. The yard has a collection arm.',
    tone: 'costly',
    omen: 'The invoice is travelling faster than you are.',
    trigger: { kind: 'nodes', count: 5 },
    payoff: [
      { op: 'alloy', amount: -110 },
      { op: 'health', amount: -8 },
    ],
  },
];
