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
    /* Costly, not mixed. The Alloy was here to make the Thread "balanced" and
       it made it incoherent instead — a seam you welded shut does not pay you
       when it finally goes. A Thread that hurts is allowed to just hurt; that
       is what the tone is for, and the pool has positive ones to sit against. */
    tone: 'costly',
    omen: 'It will fail somewhere. What it takes with it is the question.',
    trigger: { kind: 'nodes', count: 4 },
    payoff: [{ op: 'health', amount: -10 }],
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
      { op: 'health', amount: 10 },
    ],
    /* The only repeatable Thread, and the only one that should be.
     *
     * Every other Thread is a promise the run makes once — a debt you can pay
     * twice is not a debt, and a reprisal that comes for you again is just a
     * difficulty setting. Kneeling at a second shrine is a thing a person
     * actually does, and it costs the same thing every time: four nodes of one
     * of your four Thread slots, and whatever the shrine asked for.
     *
     * Three times is the price of the only artifact in the game. That is
     * roughly twelve nodes carrying it plus finding three shrines to kneel at,
     * which is most of a run spent on a detour — which is the point. The
     * artifact used to be a 1-in-18 roll on an Elite screen. Now it is
     * something you decided to go and get. */
    repeatable: true,
    mastery: {
      after: 3,
      effects: [{ op: 'relic', relicId: 'sect_reliquary' }],
    },
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
    /* A debt collects money, and only money.
    
       It used to take health as well, which made the yard read as a beating
       rather than an invoice, and it meant credit was priced in two currencies
       when the whole point of credit is that it is priced in one. The figure is
       set above every option that can open it -- 120, 130, 115 and 140 -- so
       borrowing is always a loss on the ledger and the question is only whether
       having the Alloy *now* was worth it. */
    payoff: [{ op: 'alloy', amount: -175 }],
  },

  /* ---- the second batch ----
     Written to a shape the first six only half kept: a Thread should change
     what you *do*, not only what you have when it lands. A card that arrives
     mid-act, a debt that comes due in the middle of a fight, a favour that
     pays in upgrades rather than Alloy — each of those makes the next twenty
     minutes read differently, which is the whole reason the mechanism exists. */

  {
    id: 'salvage_claim',
    name: 'Salvage Claim',
    description: 'You filed on a wreck you had no business filing on. The paperwork is travelling.',
    tone: 'mixed',
    omen: 'Somebody is checking whether the wreck was yours.',
    trigger: { kind: 'nodes', count: 5 },
    payoff: [
      { op: 'alloy', amount: 190 },
      { op: 'health', amount: -9 },
    ],
  },
  {
    id: 'the_passenger',
    name: 'The Passenger',
    description: 'Somebody is in the aft compartment. They have not said why, and you have not asked.',
    tone: 'mixed',
    omen: 'You will find out what they were running from.',
    trigger: { kind: 'nodes', count: 6 },
    payoff: [
      { op: 'upgradeRandomCard' },
      { op: 'maxHealth', amount: 6 },
      { op: 'alloy', amount: -80 },
    ],
  },
  {
    id: 'borrowed_charts',
    name: 'Borrowed Charts',
    description: 'A pilot lent you their routes. They were not theirs to lend.',
    tone: 'mixed',
    omen: 'The lanes are good. Somebody wants them back.',
    trigger: { kind: 'nodes', count: 4 },
    payoff: [
      { op: 'removeRandomCard' },
      { op: 'alloy', amount: 80 },
    ],
  },
  {
    id: 'quiet_repair',
    name: 'The Quiet Repair',
    description: 'A yard crew worked on your cutter overnight and would not say who paid.',
    tone: 'positive',
    omen: 'Something was done for you, and it has not shown itself yet.',
    trigger: { kind: 'nodes', count: 5 },
    payoff: [
      { op: 'maxHealth', amount: 10 },
      { op: 'health', amount: 10 },
    ],
  },
];
