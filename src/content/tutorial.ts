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
    /* Short on purpose. The lesson is nine steps long and the fight has to fit
       inside it — 28 means turn one's scripted Sever takes half of it and turn
       two's hand finishes the job with room to spare. A tutorial that outlasts
       its own explanation is a tutorial nobody completes. */
    maxHp: 28,
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
 * Twenty cards, and the ORDER is the script.
 *
 * `startCombat` skips the shuffle for the introduction, so this array is the
 * draw order: the first five are turn one's hand, the next five are turn two's.
 * Each of the three cards the lesson asks for is placed in the hand it is
 * asked for in — the Block card and the Heat card on turn one, the Focus card
 * on turn two — and the rest is enough damage to finish inside that turn.
 *
 * Change the order and the lesson points at cards that are not there. There is
 * a test for exactly that.
 */
export const TUTORIAL_DECK: readonly string[] = [
  // Turn one. Solar Shield is the Block lesson, Sever the Heat lesson.
  'solar_parry',
  'sever',
  'iai_slash',
  'bulwark',
  'vector_step',

  // Turn two. Measured Draw is the Focus lesson; Meridian Cut finishes it.
  'measured_draw',
  'meridian_cut',
  'iai_slash',
  'solar_parry',
  'bulwark',

  // Slack, in case a fight runs long. Never reached by the script.
  'iai_slash',
  'solar_parry',
  'kindled_edge',
  'measured_draw',
  'half_draw',
  'settle',
  'recalibrate',
  'pressure_cut',
  'bulwark',
  'vector_step',
];

/** The cards the lesson names. Exported so a test can pin them to the hand. */
export const TUTORIAL_BLOCK_CARD = 'solar_parry';
export const TUTORIAL_HEAT_CARD = 'sever';
export const TUTORIAL_FOCUS_CARD = 'measured_draw';
