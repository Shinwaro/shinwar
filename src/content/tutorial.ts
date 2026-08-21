/* The introduction — one fight, about two minutes.
 *
 * A run is an hour with no saves, which is a lot to ask of somebody who does
 * not yet know what Heat is. This is the smallest thing that can teach the
 * loop honestly: a real fight, with the real engine, against a target that
 * cannot kill you by accident.
 *
 * **The deck is deliberately strong.** A tutorial is not the place to teach
 * that your opening twelve are mediocre on purpose — that lesson belongs to
 * Act 1, where losing is survivable. Here every card should do something
 * legible the first time it is played, so the player learns what the *systems*
 * do rather than what a bad draw feels like.
 *
 * **The target is deliberately slow.** Sixty health and a three-move cycle
 * with one real spike in it: enough that blocking matters and the fight is not
 * over in two turns, telegraphed clearly enough that "block the big one, hit
 * on the quiet ones" is discoverable rather than told.
 */

import type { EnemyDef } from '../engine/types.ts';
import { WEAK } from './statuses.ts';

export const TRAINING_HULK = 'training_hulk';
export const TUTORIAL_ENCOUNTER_ID = 'tutorial_hulk';

export const TUTORIAL_ENEMIES: readonly EnemyDef[] = [
  {
    id: TRAINING_HULK,
    name: 'Derelict Hauler',
    maxHp: 60,
    act: 1,
    tier: 'normal',
    /* A three-beat cycle you can learn inside one fight: a small hit, a
       telegraphed big one, and a turn where it does nothing to you at all. The
       quiet turn is the point — it is where "stop blocking and swing" becomes
       a thing the player works out rather than a thing they are told. */
    moves: [
      {
        id: 'drift',
        label: 'Drift',
        intent: [{ kind: 'attack', amount: 6, times: 1, label: 'Drift' }],
        effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
      {
        id: 'brace',
        label: 'Brace',
        intent: [{ kind: 'block', amount: 6, times: 1, label: 'Plate 6' }],
        effects: [{ op: 'block', amount: 6 }],
      },
      {
        id: 'slam',
        label: 'Slam',
        intent: [
          { kind: 'attack', amount: 14, times: 1, label: 'Slam' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 14, target: 'enemy' },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['drift', 'brace', 'slam'] },
    flavor: 'Nobody has flown it in a decade. It has not entirely noticed.',
  },
];

/**
 * Twenty cards, and every one of them does something visible.
 *
 * Weighted toward GUARD and IAI because those are the two stances in rotation,
 * and repeated on purpose — seeing the same card three times in one fight is
 * how a first-time player learns what it does. Nothing here exhausts, nothing
 * has a condition that can fail silently, and nothing costs three.
 */
export const TUTORIAL_DECK: readonly string[] = [
  'iai_slash',
  'iai_slash',
  'iai_slash',
  'solar_parry',
  'solar_parry',
  'solar_parry',
  'bulwark',
  'bulwark',
  'measured_draw',
  'measured_draw',
  'kindled_edge',
  'kindled_edge',
  'vector_step',
  'vector_step',
  'recalibrate',
  'settle',
  'half_draw',
  'pressure_cut',
  'sever',
  'meridian_cut',
];
