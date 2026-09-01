/* Execution — cards that pay you for finishing something.
 *
 * The rider is a plain `conditional` on `killedThisPlay`, placed after the
 * damage. Effects run in order, so by the time the conditional is evaluated
 * the blow has landed and the condition is reading what it did. No trigger
 * system, no new op, and the reward is written in the same place as everything
 * else the card does — which means `describeCard` generates the text for free.
 *
 * **What they are for.** Every attack in the game asked the same question:
 * which enemy has the most health. These ask a different one — which enemy is
 * closest to dead — and that is the first time targeting has been a decision
 * rather than an arithmetic problem. Against a pack they reward tidying up;
 * against a boss they are a plain attack with the rider dark, which is the
 * cost of carrying one.
 *
 * The bounty is deliberately spread across four currencies. Energy is tempo
 * inside the turn, Alloy is a decision three nodes from now, health is the
 * only unconditional one, and Block is the reason a defensive deck would
 * bother. If they all paid Energy they would be one card printed five times.
 *
 * ---- the second family: cards that read the bar ----
 *
 * The originals above pay out for a kill, which is binary — it happened or it
 * did not. These read how far along the enemy is instead, which turns the same
 * targeting question into a sliding one: not "can I finish this" but "which of
 * these three is worth hitting right now".
 *
 * Two shapes, on purpose. `targetHullBelowPct` is a threshold and produces
 * finishers; `targetHullMissingPct` is a slope and produces cards that get
 * quietly better all fight. And one of them reads the line from the OTHER side
 * — a card that wants a whole target is an opener, which against a pack is the
 * opposite instruction to everything else here and is the reason the family
 * does not collapse into "always hit the hurt one".
 *
 * All of them read the target's INSTANCE maximum, so a buffed enemy is measured
 * against the bar the player can actually see.
 */

import type { CardDef } from '../../engine/types.ts';
import { WEAK } from '../statuses.ts';

export const EXECUTION_CARDS: readonly CardDef[] = [
  {
    id: 'culling_stroke',
    name: 'Culling Stroke',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    /* Exhausts. A 1-cost that refunds its own Energy on a kill pays for itself
       every time it connects with something small — so in a swarm it was free,
       repeatable, and the whole turn. Once a fight, it is a tool you save for
       the right target. */
    exhaust: true,
    effects: [
      { op: 'damage', amount: 7, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [{ op: 'gainEnergy', amount: 1 }],
      },
    ],
    upgrade: {
      name: 'Culling Stroke+',
      effects: [
        { op: 'damage', amount: 10, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [{ op: 'gainEnergy', amount: 1 }],
        },
      ],
    },
    flavor: 'The cut that ends it is the one you get back.',
  },

  {
    id: 'bounty_cut',
    name: 'Bounty Cut',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    /* Exhausts whether or not it collects. A bounty is claimed once, and the
       alternative -- exhaust only on the kill -- needs an effect op that does
       not exist and would make the card's own text conditional on something the
       player cannot see until after they commit. */
    exhaust: true,
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [{ op: 'gainAlloy', amount: 40 }],
      },
    ],
    upgrade: {
      name: 'Bounty Cut+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [{ op: 'gainAlloy', amount: 65 }],
        },
      ],
    },
    flavor: 'Somebody out here is still paying per hull, and they always settle.',
  },

  {
    id: 'marrow_draw',
    name: 'Marrow Draw',
    type: 'attack',
    rarity: 'epic',
    archetype: 'iai',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'damage', amount: 13, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [{ op: 'heal', amount: 7 }],
      },
    ],
    upgrade: {
      name: 'Marrow Draw+',
      effects: [
        { op: 'damage', amount: 17, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [{ op: 'heal', amount: 10 }],
        },
      ],
    },
    flavor: 'The sect had a word for taking something back from what you killed. It was not a kind one.',
  },

  {
    id: 'clean_sweep',
    name: 'Clean Sweep',
    type: 'attack',
    rarity: 'epic',
    archetype: 'guard',
    cost: 2,
    // The AoE case is the whole reason this tier exists: the condition counts
    // kills across every target, so a sweep that finishes two things pays once
    // but pays for having been the right card.
    effects: [
      { op: 'damage', amount: 6, target: 'allEnemies' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [{ op: 'block', amount: 8 }],
      },
    ],
    upgrade: {
      name: 'Clean Sweep+',
      effects: [
        { op: 'damage', amount: 8, target: 'allEnemies' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [{ op: 'block', amount: 11 }],
        },
      ],
    },
    flavor: 'Fewer of them is the best armour there is.',
  },

  {
    id: 'the_last_word',
    name: 'The Last Word',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'iai',
    cost: 2,
    exhaust: true,
    /* No Vulnerable. The card is the execution rider — a debuff stapled on
       pointed it at a target it was trying to finish, which is the one case
       where softening it up next turn is worth nothing. */
    effects: [
      { op: 'damage', amount: 10, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [
          { op: 'gainEnergy', amount: 2 },
          { op: 'draw', amount: 2 },
        ],
      },
    ],
    upgrade: {
      name: 'The Last Word+',
      effects: [
        { op: 'damage', amount: 14, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [
            { op: 'gainEnergy', amount: 2 },
            { op: 'draw', amount: 2 },
          ],
        },
      ],
    },
    flavor: 'Say it once. Do not say it twice.',
  },

  {
    id: 'salvage_rights',
    name: 'Salvage Rights',
    type: 'attack',
    rarity: 'epic',
    archetype: 'neutral',
    cost: 1,
    /* Weaker than the yardstick on purpose. The card is not the 4 damage — it
       is the standing offer, and a deck that can reliably finish something
       with it turns every pack fight into a paycheque.
    
       Which it did, because it did not exhaust. The comment described the
       failure mode exactly and the card shipped without the thing that
       prevents it. It is one offer a fight now. */
    exhaust: true,
    effects: [
      { op: 'damage', amount: 4, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'killedThisPlay' },
        then: [
          { op: 'gainAlloy', amount: 25 },
          { op: 'draw', amount: 1 },
        ],
      },
    ],
    upgrade: {
      name: 'Salvage Rights+',
      effects: [
        { op: 'damage', amount: 6, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'killedThisPlay' },
          then: [
            { op: 'gainAlloy', amount: 40 },
            { op: 'draw', amount: 1 },
          ],
        },
      ],
    },
    flavor: 'You stopped calling it looting somewhere around the second act.',
  },
  /* ---- reading the bar ---- */

  /* Finishing Line was here: a common, 6 damage doubling under 40%.
     Removed. Execute does the same job one tier up and does it with a real
     edge — 16 or 5, where this was 12 or 6 — and two threshold attacks that
     differ only in how gentle the cliff is teach the same lesson twice. The
     family reads better with one cliff, one slope, and one mirror. */

  {
    /* The mirror, and the reason the family is not just executions. Against a
       pack this says "hit the one nobody has touched", which is the opposite of
       every other card here; against a boss it is simply a good 1-cost that
       stops being good, which is a real cost rather than a printed one. */
    id: 'first_blood',
    name: 'First Blood',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'targetHullAbovePct', value: 70 },
        then: [{ op: 'damage', amount: 7, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'First Blood+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'targetHullAbovePct', value: 60 },
          then: [{ op: 'damage', amount: 9, target: 'enemy' }],
        },
      ],
    },
    flavor: 'The first cut is the only one it has no answer for.',
  },

  {
    /* The defensive read, and the one that makes the family a build rather than
       a pile of attacks.
     *
     * It reads the line from the OPENER's side, like First Blood, and that is
     * deliberate: a defensive card that pays out against something already
     * nearly dead is a card that pays out on the turn you least need it. This
     * one asks you to meet the thing while it is still whole — brace, take the
     * edge off it with the Weak, and be rewarded for having gone first.
     *
     * Twelve Block on an untouched target is a lot for two Energy. It is meant
     * to be: it is the whole of the card's good case, it is gone by the time
     * the fight is half over, and against a boss on its second phase this is
     * six Block and two Weak for two — which is a fair, dull rate.
     */
    id: 'meet_the_charge',
    name: 'Meet the Charge',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'guard',
    cost: 2,
    effects: [
      { op: 'block', amount: 6 },
      { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'targetHullAbovePct', value: 80 },
        then: [{ op: 'block', amount: 6 }],
      },
    ],
    upgrade: {
      name: 'Meet the Charge+',
      effects: [
        { op: 'block', amount: 8 },
        { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
        {
          op: 'conditional',
          // The window widens rather than the number rising, same as the rest
          // of the family: a card that fires more often beats one that fires
          // harder in the same narrow band.
          when: { kind: 'targetHullAbovePct', value: 65 },
          then: [{ op: 'block', amount: 8 }],
        },
      ],
    },
    flavor: 'Everything it has, it has right now. Stand where it is going.',
  },

  {
    /* The name says what it does, which is the point of it.
     *
     * Every other card in this family is a good card that gets better; this one
     * is two entirely different cards behind one threshold. Five is not a play,
     * it is what you get for being wrong — and sixteen for one Energy is well
     * above any curve in the game, which is what a card called Execute should
     * be worth when it is right.
     *
     * Written as `then`/`else` rather than as a base hit with a rider, because
     * the two halves are alternatives and not a sum: a rider would print "Deal
     * 5 damage. If the target is below 20%, deal 11 additional damage", and the
     * player would have to do the arithmetic to see the card.
     */
    id: 'execute',
    name: 'Execute',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'iai',
    cost: 1,
    effects: [
      {
        op: 'conditional',
        when: { kind: 'targetHullBelowPct', value: 30 },
        then: [{ op: 'damage', amount: 16, target: 'enemy' }],
        else: [{ op: 'damage', amount: 5, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Execute+',
      effects: [
        {
          op: 'conditional',
          when: { kind: 'targetHullBelowPct', value: 40 },
          then: [{ op: 'damage', amount: 20, target: 'enemy' }],
          else: [{ op: 'damage', amount: 7, target: 'enemy' }],
        },
      ],
    },
    flavor: 'The sect had a word for the moment. It was not a long word.',
  },

  {
    /* The slope, at the tier where a slope is worth a card. Two a step at 10%
       is 18 extra into something on its last legs and nothing at all on turn
       one, which is exactly the curve — it is a card you hold, and holding a
       card is a decision the deck did not previously have to make. */
    id: 'widening_gyre',
    name: 'Widening Gyre',
    type: 'attack',
    rarity: 'epic',
    archetype: 'iai',
    /* Two Energy, with the floor raised to pay for it.
     *
     * It went to one Energy on the argument that the bad case had to be merely
     * poor rather than unplayable, or nobody would hold the card. That was the
     * right diagnosis and the wrong lever: at one Energy the GOOD case was the
     * problem instead — nine steps into something on its last legs, for a price
     * that left the rest of the turn intact, made the finisher free.
     *
     * So the floor moves rather than the price. Four base means the bad case is
     * a playable if unexciting attack instead of a wasted draw, which is the
     * thing that made it holdable, and two Energy means the good case costs you
     * the turn around it. Same card, paid for at both ends. */
    cost: 2,
    /* One hit that gets bigger, not a hit and then more hits.

       This card was the clearest case for `plusPer`. As a base swing plus a
       `scaleWith`, a target at 10% took SIX separate blows — so every per-hit
       bonus in the game was worth six times its printed value on it, and the
       card most likely to be aimed at something nearly dead was also the best
       carrier for Strength in the deck.

       It also quietly fixes an ordering bug rather than working around one. The
       effects used to be deliberately ordered scale-first, because a base hit
       resolving before the slope was measured meant the card read a hull bar it
       had just moved itself: at 50%, four damage off a 30-hull Shard is another
       13% missing and a whole extra step, so the same card at the same fraction
       dealt 14 to a boss and 16 to a Shard. `plusPer` is measured once, before
       the first swing, so there is no order left to get wrong. */
    effects: [
      {
        op: 'damage',
        amount: 4,
        target: 'enemy',
        plusPer: { source: 'targetHullMissingPct', per: 10, amount: 2 },
      },
    ],
    upgrade: {
      name: 'Widening Gyre+',
      // Measured first here too — see the base card.
      effects: [
        { op: 'damage', amount: 0, target: 'enemy', plusPer: { source: 'targetHullMissingPct', per: 10, amount: 3 } },
        { op: 'damage', amount: 6, target: 'enemy' },
      ],
    },
    flavor: 'It opens as it turns. By the end there is nothing in the middle of it.',
  },

  {
    /* The payoff card. Cards, not Energy.
     *
     * It refunded 2 Energy and drew 1, which meant a finished execution paid
     * for the next two cards outright — at legendary that is not a payoff, it
     * is a turn that does not end, and its ceiling was set by how many
     * finishable things were on the board rather than by anything in the deck.
     * Two cards is the same promise without the loop: the turn keeps going as
     * far as your hand can carry it, and your hand is finite. The damage went
     * to 16 to pay for the Energy coming off. */
    id: 'terminal_velocity',
    name: 'Terminal Velocity',
    type: 'attack',
    rarity: 'legendary',
    archetype: 'overheat',
    cost: 2,
    effects: [
      { op: 'damage', amount: 16, target: 'enemy' },
      { op: 'gainHeat', amount: 2 },
      {
        op: 'conditional',
        when: { kind: 'targetHullBelowPct', value: 40 },
        then: [{ op: 'draw', amount: 2 }],
      },
    ],
    upgrade: {
      name: 'Terminal Velocity+',
      effects: [
        { op: 'damage', amount: 20, target: 'enemy' },
        { op: 'gainHeat', amount: 2 },
        {
          op: 'conditional',
          when: { kind: 'targetHullBelowPct', value: 50 },
          then: [{ op: 'draw', amount: 2 }],
        },
      ],
    },
    flavor: 'Past a certain point the fall is doing the work and you are only aiming.',
  },
];
