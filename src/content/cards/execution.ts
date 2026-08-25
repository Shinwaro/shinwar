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
 */

import type { CardDef } from '../../engine/types.ts';

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
    rarity: 'rare',
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
    rarity: 'rare',
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
    rarity: 'epic',
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
    rarity: 'rare',
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
];
