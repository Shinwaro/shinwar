/* Act 1 enemies.
 *
 * The shape every fight should have: a turn where you must block, and a turn
 * where blocking is a waste and you should be hitting back. Flat, even chip
 * damage is the failure mode — it makes Block a passive tax instead of a read,
 * and every fight ends up asking the same question. So the big hits are big and
 * telegraphed a turn ahead, and the small turns are genuinely small.
 *
 * Each one also asks a *different* question:
 *
 *   Scrap Hound  — unpredictable inside a readable range. Its repeat cap means
 *                  you are never guessing blind, only choosing.
 *   Lathe Drone  — a fixed cycle you can learn, with one real spike in it.
 *                  Rewards remembering where in the loop it is.
 *   Cinder Wisp  — no threat in damage, but it Scalds. It is the reason to kill
 *                  something fast rather than grind, and it is how a first-time
 *                  player meets the overheat threshold without being ambushed.
 *   Rust Tick    — a poison clock. Blocking does nothing about it, so it is the
 *                  first enemy that cannot be solved by defending.
 *   Kiln Adept   — grows. Every turn you leave it alive it hits harder, which
 *                  turns "who do I kill first" into a real question the moment
 *                  it appears next to anything else.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { POISON, SCALD, STRENGTH, WEAK } from '../statuses.ts';

export const SCRAP_HOUND = 'scrap_hound';
export const LATHE_DRONE = 'lathe_drone';
export const CINDER_WISP = 'cinder_wisp';
export const RUST_TICK = 'rust_tick';
export const KILN_ADEPT = 'kiln_adept';

export const ACT1_ENEMIES: readonly EnemyDef[] = [
  {
    id: SCRAP_HOUND,
    name: 'Scrap Hound',
    maxHp: 28,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'bite',
        label: 'Bite',
        intent: [{ kind: 'attack', amount: 11, times: 1, label: 'Bite' }],
        effects: [{ op: 'damage', amount: 11, target: 'enemy' }],
      },
      {
        id: 'snap',
        label: 'Snap',
        intent: [{ kind: 'attack', amount: 3, times: 2, label: 'Snap' }],
        effects: [{ op: 'damage', amount: 3, target: 'enemy', times: 2 }],
      },
    ],
    script: {
      kind: 'weighted',
      entries: [
        { move: 'bite', weight: 55 },
        { move: 'snap', weight: 45 },
      ],
      maxRepeats: 2,
    },
    flavor: 'Somebody welded teeth onto a cargo loader and let it go feral.',
  },

  {
    id: LATHE_DRONE,
    name: 'Lathe Drone',
    maxHp: 32,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'strike',
        label: 'Strike',
        intent: [{ kind: 'attack', amount: 5, times: 1, label: 'Strike' }],
        effects: [{ op: 'damage', amount: 5, target: 'enemy' }],
      },
      {
        id: 'plate',
        label: 'Plate',
        intent: [{ kind: 'block', amount: 8, times: 1, label: 'Plate 8' }],
        effects: [{ op: 'block', amount: 8 }],
      },
      {
        /* The spike, and it is always third. A cycle you can learn is a cycle
           you can plan a Block around — that is the whole point of it. */
        id: 'press',
        label: 'Press',
        intent: [{ kind: 'attack', amount: 14, times: 1, label: 'Press' }],
        effects: [{ op: 'damage', amount: 14, target: 'enemy' }],
      },
      {
        id: 'sap',
        label: 'Sap',
        intent: [{ kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' }],
        effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['strike', 'plate', 'press', 'sap'] },
    flavor: 'Industrial, patient, and entirely uninterested in whether you are ready.',
  },

  {
    id: CINDER_WISP,
    name: 'Cinder Wisp',
    maxHp: 18,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'ignite',
        label: 'Ignite',
        intent: [
          { kind: 'attack', amount: 3, times: 1, label: 'Ignite' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Scald 1' },
        ],
        effects: [
          { op: 'damage', amount: 3, target: 'enemy' },
          { op: 'applyStatus', status: SCALD, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'stoke',
        label: 'Stoke',
        intent: [{ kind: 'buff', amount: 1, times: 1, label: 'Strength +1' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 1, target: 'self' }],
      },
    ],
    script: { kind: 'sequence', moves: ['ignite', 'ignite', 'stoke'] },
    flavor: 'A fire that learned to hold a shape and never learned why.',
  },

  {
    /* The first enemy Block cannot answer. Low damage, but the poison is a clock
       that runs whatever you do about it, so the correct play is to stop
       defending and end it. */
    id: RUST_TICK,
    name: 'Rust Tick',
    maxHp: 24,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'lance',
        label: 'Lance',
        intent: [
          { kind: 'attack', amount: 2, times: 1, label: 'Lance' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Poison 2' },
        ],
        effects: [
          { op: 'damage', amount: 2, target: 'enemy' },
          { op: 'applyStatus', status: POISON, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'burrow',
        label: 'Burrow',
        intent: [{ kind: 'block', amount: 6, times: 1, label: 'Burrow 6' }],
        effects: [{ op: 'block', amount: 6 }],
      },
    ],
    script: { kind: 'sequence', moves: ['lance', 'burrow', 'lance'] },
    flavor: 'It has been chewing on this hull for a decade. You are a formality.',
  },

  {
    /* Grows every turn it survives. Next to anything else this is the enemy that
       makes target priority a real decision — and it is the reason focus-fire is
       worth learning in Act 1 rather than Act 3. */
    id: KILN_ADEPT,
    name: 'Kiln Adept',
    maxHp: 34,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'kindle',
        label: 'Kindle',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Strength +2' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
      },
      {
        id: 'sear',
        label: 'Sear',
        intent: [{ kind: 'attack', amount: 6, times: 1, label: 'Sear' }],
        effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
      {
        id: 'flare',
        label: 'Flare',
        intent: [{ kind: 'attack', amount: 4, times: 2, label: 'Flare' }],
        effects: [{ op: 'damage', amount: 4, target: 'enemy', times: 2 }],
      },
    ],
    script: { kind: 'sequence', moves: ['kindle', 'sear', 'flare'] },
    flavor: 'Praying, and getting hotter about it.',
  },
];
