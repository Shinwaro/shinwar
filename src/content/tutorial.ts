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

  /* Turn two: stance, then Focus banked, then Focus spent.

     Vector Step first, so the cards that read differently in IAI do so because
     of something the player just did rather than because a number changed.

     Then Drawn Breath, which banks TWO. That is the whole reason it is here
     instead of Settle: Meridian Cut consumes exactly one stack, so a two-stack
     bank is the only way the player ever sees Focus survive a card — and the
     stack that survives is what turn three's lesson reads off the face of an
     IAI Slash.

     Three cards, exactly three Energy: 0 + 1 + 2. There is a test, and there is
     no slack in the line at all, which is why the Burn lesson had to move to
     turn three when Drawn Breath's one Energy arrived. Bulwark and Hairline
     ride along unplayable, which is the "everything in your hand is discarded"
     lesson happening rather than being asserted. */
  'vector_step',
  'drawn_breath',
  'meridian_cut',
  'bulwark',
  'hairline',

  /* Two cards turn two eats.
     Vector Step draws one and Drawn Breath's IAI rider draws another, so the
     eleventh and twelfth cards are pulled into turn two's hand and discarded
     there unplayed. Nothing may live here that a later lesson names — this is
     the position that made the Burn lesson vanish the first time. */
  'sever',
  'solar_parry',

  /* Turn three: the Burn lesson, then the number.

     Culling Stroke says the word Burn on its own face and is an attack, so
     where it goes is legible. Then IAI Slash, which is the last lesson — by
     now Heat is 5 (2 from the Lance, less 1 for ending turn one in GUARD, plus
     2 from the Cut, plus 2 for ending turn two in IAI) and one Focus is banked, so a
     card whose face says 6 shows an amber 8 with a +2 beside it. Nothing about
     that step is arranged; it is what the script has already done. It is also
     exactly ON the 5-Heat line with nothing spare, so a test pins the Heat
     rather than trusting this comment. */
  'culling_stroke',
  'iai_slash',

  /* Slack. The lesson deliberately leaves the enemy alive, so these are what
     the player finishes it with. */
  'half_draw',
  'settle',
  'recalibrate',
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
/**
 * The Focus lesson. Two stacks, not one.
 *
 * It was Settle, which banks one — and one is the number that makes the
 * mechanic invisible, because the very next card eats it and the row is empty
 * again before the player has looked away. Drawn Breath banks two, an attack
 * spends exactly one, and what is left over is a stack the player can watch
 * doing something on a later turn.
 */
export const TUTORIAL_FOCUS_CARD = 'drawn_breath';
/**
 * The card the last lesson reads, rather than plays.
 *
 * By turn three it carries both bonuses at once — the stance's +2 for being at
 * 5 Heat or more, and +2 for the Focus stack that survived Meridian Cut — so
 * its face says 10 where the card says 6, in orange. That is the one place the
 * game does arithmetic for the player, and it had never been pointed at.
 */
export const TUTORIAL_NUMBER_CARD = 'iai_slash';
/**
 * The card the lesson spends its Focus on.
 *
 * Gaining a Focus and spending one are two different ideas and were taught as
 * one: the step said what the stack WOULD become and then moved on, so the only
 * resource whose whole point is being banked for later was never actually seen
 * to pay out.
 */
export const TUTORIAL_SPEND_CARD = 'meridian_cut';
