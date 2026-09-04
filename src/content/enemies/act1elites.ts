/* Act 1's elites and its boss.
 *
 * Bands from DESIGN.md §8: elites 80-110 HP and 14-20 a turn, the boss 150-180
 * and 18-26. Act 1's elite is where the first Stance Mastery comes from, so it
 * has to be beatable with a starting deck plus two or three picks — hard, not a
 * wall.
 *
 * The boss is a culmination of what Act 1 taught: the gauge matters, and a turn
 * you cannot block has to be planned for rather than absorbed.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { SCALD, STRENGTH, VULNERABLE, WEAK } from '../statuses.ts';

export const KILN_ALPHA = 'kiln_alpha';
export const MAG_LATHE = 'mag_lathe';
export const KILN_SOVEREIGN = 'kiln_sovereign';

export const ACT1_ELITES: readonly EnemyDef[] = [
  {
    id: KILN_ALPHA,
    name: 'Kiln Alpha',
    maxHp: 90,
    act: 1,
    tier: 'elite',
    moves: [
      {
        id: 'maul',
        label: 'Maul',
        intent: [{ kind: 'attack', amount: 13, times: 1, label: 'Maul' }],
        effects: [{ op: 'damage', amount: 13, target: 'enemy' }],
      },
      {
        id: 'worry',
        label: 'Worry',
        intent: [
          { kind: 'attack', amount: 7, times: 2, label: 'Worry' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 7, target: 'enemy', times: 2 },
          /* 2, not 1. Vulnerable sheds a stack at the end of the target's
             turn, and the move that follows this one in the script does not
             attack — so a single stack was always spent on a turn that could
             not use it, and the debuff read as a threat the enemy never
             collected on. Two means at least one attacking turn lands under
             it. */
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'bristle',
        label: 'Bristle',
        intent: [
          { kind: 'block', amount: 10, times: 1, label: 'Plate 10' },
          { kind: 'buff', amount: 2, times: 1, label: 'Strength +2' },
        ],
        effects: [
          { op: 'block', amount: 10 },
          { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['worry', 'bristle', 'maul'] },
    flavor: 'The one the others were built from. Nobody built this one.',
  },

  {
    id: MAG_LATHE,
    name: 'Mag-Lathe Warden',
    maxHp: 72,
    act: 1,
    tier: 'elite',
    moves: [
      {
        id: 'spool',
        label: 'Spool',
        intent: [
          { kind: 'block', amount: 14, times: 1, label: 'Plate 14' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'block', amount: 14 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'cut',
        label: 'Cut',
        intent: [{ kind: 'attack', amount: 7, times: 2, label: 'Cut' }],
        effects: [{ op: 'damage', amount: 7, target: 'enemy', times: 2 }],
      },
      {
        id: 'true',
        label: 'True',
        intent: [
          { kind: 'attack', amount: 15, times: 1, label: 'True' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 15, target: 'enemy' },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['spool', 'cut', 'true'] },
    flavor: 'It machines everything to tolerance. You are out of tolerance.',
  },

  {
    /* Act 1's closing argument: can you regulate the reactor?
     *
     * Each boss asks about one system, and this one asks about the gauge. Two
     * of its four moves put Heat on you and a third leaves Scald behind, so a
     * player who has been treating Heat as a number that goes up and comes back
     * down on its own finds out here that it does not.
     *
     * **The escalation is Scald, not Strength.** It used to stack Strength,
     * which made a long fight hit harder in a way you could only answer with
     * more Block — a fine idea and the wrong one for this fight. Scald never
     * decays and sheds only to a vent of 2 or more in a single action, so the
     * longer this runs the more Heat arrives at every turn start, and the
     * counter is specific rather than general: you need a real vent, not more
     * armour. A player who has one wins comfortably. A player who has ignored
     * the whole system spends the back half of the fight overheating.
     *
     * Under 40% it stops plating and alternates its two hardest moves, which
     * shortens the fight rather than lengthening it. A boss made harder by
     * adding hull is a boss made longer, and a first act that outstays its
     * welcome is worse than one that is slightly too easy.
     */
    id: KILN_SOVEREIGN,
    name: 'Kiln Sovereign',
    /* 136, up from 118 — a slight buff, and deliberately only slight. Act 1's
       boss is the one fight a first run is entitled to survive on an unfinished
       deck, so the lesson is "your twelve cards are not enough yet" rather than
       "you have already lost". */
    maxHp: 136,
    act: 1,
    tier: 'boss',
    moves: [
      {
        id: 'bank_fire',
        label: 'Bank the Fire',
        intent: [
          { kind: 'block', amount: 16, times: 1, label: 'Plate 16' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Heat +3' },
        ],
        effects: [
          { op: 'block', amount: 16 },
          { op: 'gainHeat', amount: 3 },
        ],
      },
      {
        /* The Scald turn, and the whole fight in one move: a small hit and a
           stack that will not leave on its own. */
        id: 'flare',
        label: 'Flare',
        intent: [
          { kind: 'attack', amount: 10, times: 1, label: 'Flare' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Scald 1' },
        ],
        effects: [
          { op: 'damage', amount: 10, target: 'enemy' },
          { op: 'applyStatus', status: SCALD, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'rake',
        label: 'Rake',
        intent: [{ kind: 'attack', amount: 11, times: 2, label: 'Rake' }],
        effects: [{ op: 'damage', amount: 11, target: 'enemy', times: 2 }],
      },
      {
        /* The spike, and it is a Heat spike as much as a damage one — four is
           half the distance to the line from a cold gauge, and rather less than
           that from the gauge this fight has been building. */
        id: 'tap_out',
        label: 'Tap Out',
        intent: [
          { kind: 'attack', amount: 20, times: 1, label: 'Tap Out' },
          { kind: 'debuff', amount: 4, times: 1, label: 'Heat +4' },
        ],
        effects: [
          { op: 'damage', amount: 20, target: 'enemy' },
          { op: 'gainHeat', amount: 4 },
        ],
      },
    ],
    script: {
      kind: 'phased',
      threshold: 40,
      opening: ['bank_fire', 'flare', 'rake'],
      closing: ['tap_out', 'flare'],
    },
    flavor: 'It has been holding this system at working temperature since the sect died.',
  },
];
