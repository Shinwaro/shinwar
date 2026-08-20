/* Act 3 enemies — the adaptation layer.
 *
 * This is the answer to "how do I stop players executing one optimal strategy",
 * from DESIGN.md §5. These enemies read the player's *build* rather than the
 * player's play, and each one is a counter to an archetype:
 *
 *   Chirality Warden — takes 60% less from anything over 20. Kills the pure-IAI
 *                      one-shot plan; asks you to have a second gear.
 *   Heat Siphon      — gains Strength equal to your Heat. Overheat builds have
 *                      to actually manage the gauge rather than ride it.
 *   Null Prism       — the first card you play each turn is exhausted after it
 *                      resolves. Punishes a deck leaning on one key card.
 *   Tessellate Shard — three of them, sharing plating. Punishes single-target
 *                      burst and rewards anything that hits wide.
 *
 * The point is that the player can *see* which of these is ahead of them on the
 * map. The correct move is never "have a perfect deck", it is "route toward the
 * ones your build handles and pick up one answer for the ones it does not".
 * That is adaptation rather than execution.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { SCALD, STRENGTH, VULNERABLE, WEAK } from '../statuses.ts';

export const CHIRALITY_WARDEN = 'chirality_warden';
export const HEAT_SIPHON = 'heat_siphon';
export const NULL_PRISM = 'null_prism';
export const TESSELLATE_SHARD = 'tessellate_shard';
export const RIMEWAKE = 'rimewake';

export const MIRROR_RONIN = 'mirror_ronin';
export const COLLAPSE_CHOIR = 'collapse_choir';
export const EVENT_HORIZON = 'event_horizon';

export const ACT3_ENEMIES: readonly EnemyDef[] = [
  {
    id: CHIRALITY_WARDEN,
    name: 'Chirality Warden',
    maxHp: 82,
    act: 3,
    tier: 'normal',
    // Declared rather than hooked: this is a rule about the number the pipeline
    // is producing, and the preview has to show it or the preview is a lie.
    damageRules: { overAmount: 20, multiplier: 0.4, label: 'Chirality' },
    moves: [
      {
        id: 'invert',
        label: 'Invert',
        intent: [
          { kind: 'attack', amount: 24, times: 1, label: 'Invert' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 24, target: 'enemy' },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'handedness',
        label: 'Handedness',
        intent: [{ kind: 'attack', amount: 6, times: 3, label: 'Handedness' }],
        effects: [{ op: 'damage', amount: 6, target: 'enemy', times: 3 }],
      },
    ],
    script: {
      kind: 'weighted',
      entries: [
        { move: 'invert', weight: 1 },
        { move: 'handedness', weight: 1 },
      ],
      maxRepeats: 2,
    },
    flavor: 'Big swings arrive mirrored. It is very hard to cut something the wrong way round.',
  },

  {
    id: HEAT_SIPHON,
    name: 'Heat Siphon',
    maxHp: 70,
    act: 3,
    tier: 'normal',
    moves: [
      {
        id: 'tap',
        label: 'Tap',
        intent: [{ kind: 'attack', amount: 10, times: 1, label: 'Tap' }],
        effects: [{ op: 'damage', amount: 10, target: 'enemy' }],
      },
      {
        id: 'stoke',
        label: 'Stoke',
        intent: [
          { kind: 'attack', amount: 6, times: 1, label: 'Stoke' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Heat +3' },
        ],
        effects: [
          { op: 'damage', amount: 6, target: 'enemy' },
          { op: 'gainHeat', amount: 3 },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['stoke', 'tap'] },
    flavor: 'It runs on your exhaust. Every clever thing you do makes it heavier.',
  },

  {
    id: NULL_PRISM,
    name: 'Null Prism',
    maxHp: 76,
    act: 3,
    tier: 'normal',
    moves: [
      {
        id: 'refract',
        label: 'Refract',
        intent: [
          { kind: 'attack', amount: 14, times: 1, label: 'Refract' },
          { kind: 'block', amount: 8, times: 1, label: 'Plate 8' },
        ],
        effects: [
          { op: 'damage', amount: 14, target: 'enemy' },
          { op: 'block', amount: 8 },
        ],
      },
      {
        id: 'null',
        label: 'Null',
        intent: [
          { kind: 'attack', amount: 8, times: 2, label: 'Null' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Vulnerable 1' },
        ],
        effects: [
          { op: 'damage', amount: 8, target: 'enemy', times: 2 },
          { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['refract', 'null'] },
    flavor: 'The first thing you do in front of it stops having ever been yours.',
  },

  {
    id: TESSELLATE_SHARD,
    name: 'Tessellate Shard',
    maxHp: 32,
    act: 3,
    tier: 'normal',
    moves: [
      {
        id: 'facet',
        label: 'Facet',
        intent: [{ kind: 'attack', amount: 6, times: 1, label: 'Facet' }],
        effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
      {
        id: 'tile',
        label: 'Tile',
        intent: [{ kind: 'block', amount: 9, times: 1, label: 'Plate 9' }],
        effects: [{ op: 'block', amount: 9 }],
      },
    ],
    script: { kind: 'sequence', moves: ['tile', 'facet', 'facet'] },
    flavor: 'One of it is nothing. It is never one of it.',
  },

  /* ---- elites: 180-230 HP, 30-40 a turn ---- */

  {
    /* Act 3's timer. +3 Strength every third turn compounds on a three-hit
       move, so a fight you cannot finish becomes one you cannot survive -- and
       the Scald means the obvious answer (turtle up and grind) walks you into
       an overheat instead. Kill it first or lose to it late. */
    id: RIMEWAKE,
    name: 'Rimewake',
    maxHp: 78,
    act: 3,
    tier: 'normal',
    moves: [
      {
        id: 'gather',
        label: 'Gather',
        intent: [
          { kind: 'buff', amount: 3, times: 1, label: 'Strength +3' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Scald 1' },
        ],
        effects: [
          { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
          { op: 'applyStatus', status: SCALD, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'rake',
        label: 'Rake',
        intent: [{ kind: 'attack', amount: 5, times: 3, label: 'Rake' }],
        effects: [{ op: 'damage', amount: 5, target: 'enemy', times: 3 }],
      },
      {
        id: 'crest',
        label: 'Crest',
        intent: [{ kind: 'attack', amount: 16, times: 1, label: 'Crest' }],
        effects: [{ op: 'damage', amount: 16, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['gather', 'rake', 'crest'] },
    flavor: 'Whatever it is trailing, it has been trailing it a long way.',
  },

  {
    id: MIRROR_RONIN,
    name: 'Mirror Ronin',
    maxHp: 165,
    act: 3,
    tier: 'elite',
    damageRules: { overAmount: 26, multiplier: 0.5, label: 'Mirror' },
    moves: [
      {
        id: 'iai',
        label: 'IAI',
        intent: [{ kind: 'attack', amount: 23, times: 1, label: 'IAI' }],
        effects: [{ op: 'damage', amount: 23, target: 'enemy' }],
      },
      {
        id: 'guard',
        label: 'Guard',
        intent: [
          { kind: 'block', amount: 22, times: 1, label: 'Guard 22' },
          { kind: 'buff', amount: 3, times: 1, label: 'Strength +3' },
        ],
        effects: [
          { op: 'block', amount: 22 },
          { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        ],
      },
      {
        id: 'sever',
        label: 'Sever',
        intent: [
          { kind: 'attack', amount: 9, times: 3, label: 'Sever' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Weak 2' },
        ],
        effects: [
          { op: 'damage', amount: 9, target: 'enemy', times: 3 },
          { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['guard', 'iai', 'sever'] },
    flavor: 'Your school, your forms, your bad habit of over-committing on the third beat.',
  },

  {
    id: COLLAPSE_CHOIR,
    name: 'Collapse Choir',
    maxHp: 155,
    act: 3,
    tier: 'elite',
    moves: [
      {
        id: 'descant',
        label: 'Descant',
        intent: [
          { kind: 'attack', amount: 7, times: 4, label: 'Descant' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Heat +3' },
        ],
        effects: [
          { op: 'damage', amount: 7, target: 'enemy', times: 4 },
          { op: 'gainHeat', amount: 3 },
        ],
      },
      {
        id: 'unison',
        label: 'Unison',
        intent: [
          { kind: 'attack', amount: 22, times: 1, label: 'Unison' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 22, target: 'enemy' },
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'rest',
        label: 'Rest',
        intent: [
          { kind: 'block', amount: 26, times: 1, label: 'Plate 26' },
          { kind: 'buff', amount: 3, times: 1, label: 'Strength +3' },
        ],
        effects: [
          { op: 'block', amount: 26 },
          { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['rest', 'descant', 'unison'] },
    flavor: 'Everyone the front has already reached, arriving all at once, on time.',
  },

  /* ---- the last boss: 300-360 HP, 35-50 a turn ----
     Into the Breach's lesson: the boss is a culmination, not a curveball. Every
     move here is something the run already taught, harder. No new mechanic. */

  {
    id: EVENT_HORIZON,
    name: 'The Event Horizon',
    maxHp: 205,
    act: 3,
    tier: 'boss',
    damageRules: { overAmount: 30, multiplier: 0.6, label: 'Horizon' },
    moves: [
      {
        id: 'tidal',
        label: 'Tidal',
        intent: [
          { kind: 'attack', amount: 11, times: 3, label: 'Tidal' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'damage', amount: 11, target: 'enemy', times: 3 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'accretion',
        label: 'Accretion',
        intent: [
          { kind: 'block', amount: 30, times: 1, label: 'Plate 30' },
          { kind: 'buff', amount: 4, times: 1, label: 'Strength +4' },
        ],
        effects: [
          { op: 'block', amount: 30 },
          { op: 'applyStatus', status: STRENGTH, stacks: 4, target: 'self' },
        ],
      },
      {
        id: 'crossing',
        label: 'Crossing',
        intent: [
          { kind: 'attack', amount: 32, times: 1, label: 'Crossing' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 32, target: 'enemy' },
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'silence',
        label: 'Silence',
        intent: [
          { kind: 'attack', amount: 9, times: 2, label: 'Silence' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Weak 3' },
        ],
        effects: [
          { op: 'damage', amount: 9, target: 'enemy', times: 2 },
          { op: 'applyStatus', status: WEAK, stacks: 3, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['tidal', 'accretion', 'crossing', 'silence'] },
    flavor: 'Not a thing that arrived. A place the frontier finished falling into.',
  },
];
