/* Neutral cards — the ones that work in any deck.
 *
 * Deliberately the least exciting file in the pool. Neutrals are the glue that
 * stops a run dying because the rewards never offered your archetype; the
 * interesting cards live in the archetype files.
 *
 * The two top-tier cards live here because they are not for any one build.
 */

import type { CardDef } from '../../engine/types.ts';
import { RUST, STRENGTH, VULNERABLE } from '../statuses.ts';

export const NEUTRAL_CARDS: readonly CardDef[] = [
  {
    id: 'hairline',
    name: 'Hairline',
    type: 'attack',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    effects: [{ op: 'damage', amount: 4, target: 'enemy' }],
    upgrade: { name: 'Hairline+', effects: [{ op: 'damage', amount: 6, target: 'enemy' }] },
    flavor: 'Not a wound. A place for the next one to start.',
  },

  {
    id: 'recalibrate',
    name: 'Recalibrate',
    type: 'skill',
    rarity: 'common',
    archetype: 'neutral',
    cost: 1,
    effects: [{ op: 'draw', amount: 2 }],
    upgrade: { name: 'Recalibrate+', cost: 0, effects: [{ op: 'draw', amount: 2 }] },
    flavor: 'Half of piloting is admitting the last reading was wrong.',
  },

  {
    id: 'pressure_cut',
    name: 'Pressure Cut',
    type: 'attack',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    // 5, not 7. Vulnerable is worth more than a flat number on the same card —
    // it multiplies everything that follows it this turn — so the attack it
    // rides on should not also be the best 1-cost attack in the pool.
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
    ],
    upgrade: {
      name: 'Pressure Cut+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
      ],
    },
    flavor: 'Open the seam. The vacuum finishes the argument.',
  },

  {
    id: 'overdraw',
    name: 'Overdraw',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'draw', amount: 3 },
      { op: 'discard', amount: 1, random: true },
    ],
    upgrade: {
      name: 'Overdraw+',
      effects: [
        { op: 'draw', amount: 4 },
        { op: 'discard', amount: 1, random: true },
      ],
    },
    flavor: 'Take everything off the rack and sort it out mid-fall.',
  },

  {
    id: 'momentum',
    name: 'Momentum',
    type: 'attack',
    rarity: 'rare',
    archetype: 'neutral',
    cost: 1,
    effects: [
      {
        op: 'scaleWith',
        source: 'cardsPlayedThisTurn',
        per: 1,
        then: [{ op: 'damage', amount: 3, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Momentum+',
      effects: [
        {
          op: 'scaleWith',
          source: 'cardsPlayedThisTurn',
          per: 1,
          then: [{ op: 'damage', amount: 4, target: 'enemy' }],
        },
      ],
    },
    flavor: 'Nothing in vacuum stops on its own. Including you.',
  },

  {
    id: 'starfall',
    name: 'Starfall',
    type: 'attack',
    // Epic, not legendary: the top two tiers are the Reliquary's four and
    // nothing else, or "one legendary a run" is not a rule. Starfall is an
    // exhausting 2-cost AoE, which is where epic already sits.
    rarity: 'epic',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'damage', amount: 12, target: 'allEnemies' },
      { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'allEnemies' },
      { op: 'gainHeat', amount: 3 },
    ],
    upgrade: {
      name: 'Starfall+',
      effects: [
        { op: 'damage', amount: 16, target: 'allEnemies' },
        { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'allEnemies' },
        { op: 'gainHeat', amount: 3 },
      ],
    },
    flavor: 'The sect had one of these. The sect used it once.',
  },

  {
    id: 'the_dead_sect',
    name: 'The Dead Sect',
    type: 'skill',
    rarity: 'artifact',
    archetype: 'neutral',
    cost: 2,
    exhaust: true,
    effects: [
      { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
      { op: 'draw', amount: 2 },
      { op: 'ventHeat', amount: 4 },
    ],
    upgrade: {
      name: 'The Dead Sect+',
      effects: [
        { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        { op: 'draw', amount: 2 },
        { op: 'ventHeat', amount: 4 },
      ],
    },
    flavor: 'Every name you were taught, spoken once, in order, to nobody.',
  },

  /* ---- the second batch ----
     Rust had one card. Healing had none — the `heal` op existed and only
     Anomalies ever used it, which meant the deck could not answer the one
     resource the run is actually about. And nothing outside an execution rider
     had ever turned a fight into money. */

  {
    id: 'corrosive_edge',
    name: 'Corrosive Edge',
    type: 'attack',
    rarity: 'common',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'damage', amount: 5, target: 'enemy' },
      { op: 'applyStatus', status: RUST, stacks: 2, target: 'enemy' },
    ],
    upgrade: {
      name: 'Corrosive Edge+',
      effects: [
        { op: 'damage', amount: 7, target: 'enemy' },
        { op: 'applyStatus', status: RUST, stacks: 3, target: 'enemy' },
      ],
    },
    flavor: 'It is not the cut that finishes it. It is the week after.',
  },

  {
    id: 'rust_bloom',
    name: 'Rust Bloom',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    cost: 1,
    // A clock nothing can Block, spread across the room. Against one enemy it
    // is weak on purpose; against four it is the reason you brought it.
    effects: [{ op: 'applyStatus', status: RUST, stacks: 2, target: 'allEnemies' }],
    upgrade: {
      name: 'Rust Bloom+',
      effects: [{ op: 'applyStatus', status: RUST, stacks: 3, target: 'allEnemies' }],
    },
    flavor: 'Let the air do it.',
  },

  {
    id: 'field_repair',
    name: 'Field Repair',
    type: 'skill',
    rarity: 'uncommon',
    archetype: 'neutral',
    // Two, not one. It is the only card that heals, and at 1 Energy it was a
    // free top-up rather than a turn you decided to spend not fighting.
    cost: 2,
    exhaust: true,
    /* The only card that heals. Exhausts, and heals a fraction of what a
       Station does, because a deck that can repair itself for free removes the
       reason to route toward anything. */
    effects: [{ op: 'heal', amount: 7 }],
    upgrade: {
      name: 'Field Repair+',
      effects: [{ op: 'heal', amount: 11 }],
    },
    flavor: 'Not fixed. Closed, and holding, and that will do.',
  },

  {
    id: 'scavengers_eye',
    name: 'Scavenger’s Eye',
    type: 'skill',
    rarity: 'common',
    archetype: 'neutral',
    cost: 0,
    /* Alloy leaves the fight, so a card that prints it cannot be allowed to be
       played twice. At 0 cost and no exhaust this was a deck that farmed its
       own draw pile: every reshuffle was another 12, and the only limit was how
       long you were willing to make the fight. Health is the same argument --
       both survive the combat, and nothing that survives the combat may be
       repeatable inside one. */
    exhaust: true,
    effects: [
      { op: 'draw', amount: 1 },
      { op: 'gainAlloy', amount: 12 },
    ],
    upgrade: {
      name: 'Scavenger’s Eye+',
      effects: [
        { op: 'draw', amount: 1 },
        { op: 'gainAlloy', amount: 22 },
      ],
    },
    flavor: 'Everything in here used to belong to somebody who is not using it.',
  },

  {
    id: 'desperate_line',
    name: 'Desperate Line',
    type: 'attack',
    rarity: 'rare',
    archetype: 'neutral',
    cost: 1,
    effects: [
      { op: 'damage', amount: 6, target: 'enemy' },
      {
        op: 'conditional',
        when: { kind: 'hullBelowPct', value: 50 },
        then: [{ op: 'damage', amount: 9, target: 'enemy' }],
      },
    ],
    upgrade: {
      name: 'Desperate Line+',
      effects: [
        { op: 'damage', amount: 8, target: 'enemy' },
        {
          op: 'conditional',
          when: { kind: 'hullBelowPct', value: 60 },
          then: [{ op: 'damage', amount: 11, target: 'enemy' }],
        },
      ],
    },
    flavor: 'The sect had nothing to say about this one. They never got this far down.',
  },
];
