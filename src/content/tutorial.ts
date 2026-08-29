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
 * **The target is deliberately slow, and deliberately outlasts the lesson.** A
 * three-move cycle with one real spike in it: enough that blocking matters,
 * telegraphed clearly enough that "block the big one, hit on the quiet ones" is
 * discoverable rather than told. It is still standing when the last step is
 * read, because the last step ends with "now finish it" and a lesson that kills
 * its own subject halfway through never gets to say that.
 */

import type { EnemyDef } from '../engine/types.ts';
import { WEAK } from './statuses.ts';

export const TRAINING_HULK = 'training_hulk';
export const TUTORIAL_ENCOUNTER_ID = 'tutorial_hulk';

export const TUTORIAL_ENEMIES: readonly EnemyDef[] = [
  {
    id: TRAINING_HULK,
    name: 'Derelict Hauler',
    /* Big enough to OUTLAST the lesson, which is the opposite of what it used
       to be for.

       At 22 the scripted plays killed it, and the last word of the tutorial —
       the one that says where the log and the Info panel are — arrived after
       the fight had already ended, or never arrived at all. A lesson whose
       closing line is unreachable is a lesson with no closing line.

       The number is measured, not guessed: the seven scripted plays deal 39
       through the stance riders and the Focus spend, so anything at or below
       that ends the fight early. 48 leaves 9 on the bar when the last step
       appears — one more card, which is exactly the note to end on. There is a
       test on both halves: that the script does not finish it, and that what is
       left in the deck can. */
    maxHp: 48,
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
    /* Drift, then Slam, then Brace — and the ORDER is part of the lesson.
     *
     * Slam is the only move that puts something on the player, and the lesson
     * needs it on turn two: that is where the coach points at the telegraph and
     * says debuffs go both ways, and then at the Weak it leaves behind and says
     * the number on your cards does not know about it. With Brace in the middle
     * the player was shown a debuff aimed at them exactly once, on a turn
     * nobody was talking about it.
     *
     * Drift stays first. Two steps quote the six it swings for. */
    script: { kind: 'sequence', moves: ['drift', 'slam', 'brace'] },
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
  /* Turn one. Solar Shield is the Block lesson, Thermal Lance the Heat one.

     Not Sever, which was the obvious pick and the wrong one: its GUARD rider
     vents 2 of the 3 Heat it gains, so the lesson about Heat ended with the
     gauge reading 1 and nothing to look at. Thermal Lance adds 2 and keeps
     them. */
  'solar_parry',
  'thermal_lance',
  'iai_slash',
  'bulwark',
  'hairline',

  /* Turn two, and it holds four of the seven lessons — which is why the order
     inside it matters as much as which cards are in it.

     Vector Step first: the stance step is taught before the cards that read
     differently because of it, so Meridian Cut's IAI bonus is something the
     player just caused rather than a number that appeared. Then Culling Stroke,
     which is the Burn lesson and the only card in the deck that says the word.
     Then Settle and Meridian Cut, which are Focus banked and Focus spent.

     Four cards, and exactly three Energy: 0 + 1 + 0 + 2. There is a test. */
  'vector_step',
  'culling_stroke',
  'settle',
  'meridian_cut',
  'bulwark',

  /* Slack. Reached now, unlike before: the lesson deliberately leaves the enemy
     alive, so these are what the player finishes it with. */
  'sever',
  'solar_parry',
  'iai_slash',
  'half_draw',
  'settle',
  'recalibrate',
  'hairline',
  'bulwark',
  'vector_step',
  'kindled_edge',
];

/** The cards the lesson names. Exported so a test can pin them to the hand. */
export const TUTORIAL_BLOCK_CARD = 'solar_parry';
export const TUTORIAL_HEAT_CARD = 'thermal_lance';
/** The stance lesson: play it and watch the strip change. */
export const TUTORIAL_STANCE_CARD = 'vector_step';
/**
 * The Burn lesson.
 *
 * Told AND done, rather than pointed at. The pile had a name and an
 * explanation and nothing in the deck that ever put a card in it, so the one
 * mechanic in the game with a one-way door was the only one taught entirely in
 * the abstract. Culling Stroke is an attack, so what it does is legible on the
 * board, and it says the word on its own face.
 */
export const TUTORIAL_BURN_CARD = 'culling_stroke';
export const TUTORIAL_FOCUS_CARD = 'settle';
/**
 * The card the lesson spends its Focus on.
 *
 * Gaining a Focus and spending one are two different ideas and were taught as
 * one: the step said what the stack WOULD become and then moved on, so the only
 * resource whose whole point is being banked for later was never actually seen
 * to pay out.
 */
export const TUTORIAL_SPEND_CARD = 'meridian_cut';
