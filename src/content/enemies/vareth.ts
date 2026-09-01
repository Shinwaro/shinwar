/* The Vareth, who are not a faction so much as a consequence.
 *
 * They existed only as lore for a long time: a dying insectile species, a
 * hab-shell barely holding pressure, one viable egg left, and a translator too
 * crude to argue with. Every branch of The Last Clutch — carry the egg, sell it,
 * or break the shell for a knife — sets the `marked` Thread, and that Thread
 * says "The Vareth know your ship. They are slower than you and they do not
 * stop." Then the reprisal it triggered rolled a random Kiln Alpha. The sentence
 * was doing all the work and nothing on the board agreed with it.
 *
 * So this file is that sentence, made mechanical.
 *
 * **Slower than you** is armour and wind-up. Every hunter opens its cycle on a
 * move that deals no damage at all — it plates itself and closes — so the fight
 * always hands you one free turn and then charges you for it. Chitin is the
 * Vareth's whole biology and it is their whole defence: they Block more than
 * anything else at their tier, which makes them a burst problem rather than a
 * damage-race problem. That matters because the Elites they replace are already
 * the tanky node; a Vareth party that was merely bulkier would have been a
 * longer fight, not a harder one.
 *
 * **They do not stop** is Strength, and it is the reason these fights are not
 * slogs. Strength never decays — see `statuses.ts` — so the plating move that
 * costs them a turn of damage buys a permanent raise on every attack after it.
 * Stall a Vareth party and it does not run out of patience; it gets stronger on
 * a clock you cannot vent, block or wait out. The only answer is to end it,
 * which is exactly the pressure an Elite board does not apply.
 *
 * Three pairs, one per act: the scout that found you, the one guarding the
 * clutch, and the one that laid it. Each pair is a hunter and a drone, because a
 * hunting party is a party — and because the drone is where the damage that
 * makes this harder than an Elite actually comes from, rather than from
 * inflating the hunter into a boss.
 *
 * They are reachable ONLY through a reprisal — `ambush: true` on their
 * encounters — so no chart ever places them. The Vareth are not wildlife on a
 * route; they are following you specifically.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { STRENGTH, VULNERABLE, WEAK } from '../statuses.ts';

export const VARETH_HUNTRESS = 'vareth_huntress';
export const VARETH_DRONE = 'vareth_drone';
export const VARETH_CLUTCHWARD = 'vareth_clutchward';
export const VARETH_OUTRIDER = 'vareth_outrider';
export const VARETH_MATRIARCH = 'vareth_matriarch';
export const VARETH_CHITINGUARD = 'vareth_chitinguard';

export const VARETH_ENEMIES: readonly EnemyDef[] = [
  /* ---------- act 1: the scout that found you ---------- */
  {
    id: VARETH_HUNTRESS,
    name: 'Vareth Huntress',
    maxHp: 88,
    act: 1,
    tier: 'elite',
    moves: [
      {
        /* The wind-up, and the whole identity in one move: no damage, real
           plating, and a permanent raise. Giving up a turn of damage to plate
           up is what "slower than you" looks like from the other side of it. */
        id: 'close',
        label: 'Close',
        intent: [
          { kind: 'block', amount: 9, times: 1, label: 'Chitin 9' },
          { kind: 'buff', amount: 1, times: 1, label: 'Strength +1' },
        ],
        effects: [
          { op: 'block', amount: 9 },
          { op: 'applyStatus', status: STRENGTH, stacks: 1, target: 'self' },
        ],
      },
      {
        id: 'shear',
        label: 'Shear',
        intent: [{ kind: 'attack', amount: 18, times: 1, label: 'Shear' }],
        effects: [{ op: 'damage', amount: 18, target: 'enemy' }],
      },
      {
        id: 'flense',
        label: 'Flense',
        intent: [
          { kind: 'attack', amount: 7, times: 2, label: 'Flense' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 7, target: 'enemy', times: 2 },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['close', 'shear', 'flense'] },
    flavor: 'It has your drive signature. It has had it since the hab-shell.',
  },
  {
    id: VARETH_DRONE,
    name: 'Vareth Drone',
    maxHp: 30,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'skitter',
        label: 'Skitter',
        intent: [{ kind: 'attack', amount: 6, times: 1, label: 'Skitter' }],
        effects: [{ op: 'damage', amount: 6, target: 'enemy' }],
      },
      {
        id: 'bite',
        label: 'Bite',
        intent: [{ kind: 'attack', amount: 9, times: 1, label: 'Bite' }],
        effects: [{ op: 'damage', amount: 9, target: 'enemy' }],
      },
      {
        id: 'chitin',
        label: 'Chitin',
        intent: [{ kind: 'block', amount: 6, times: 1, label: 'Chitin 6' }],
        effects: [{ op: 'block', amount: 6 }],
      },
    ],
    script: { kind: 'sequence', moves: ['skitter', 'bite', 'chitin'] },
    flavor: 'Too small to have been asked whether it wanted to come.',
  },

  /* ---------- act 2: the one guarding the clutch ---------- */
  {
    id: VARETH_CLUTCHWARD,
    name: 'Vareth Clutchward',
    maxHp: 138,
    act: 2,
    tier: 'elite',
    moves: [
      {
        id: 'mantle',
        label: 'Mantle',
        intent: [
          { kind: 'block', amount: 16, times: 1, label: 'Chitin 16' },
          { kind: 'buff', amount: 2, times: 1, label: 'Strength +2' },
        ],
        effects: [
          { op: 'block', amount: 16 },
          { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        ],
      },
      {
        id: 'gore',
        label: 'Gore',
        intent: [{ kind: 'attack', amount: 24, times: 1, label: 'Gore' }],
        effects: [{ op: 'damage', amount: 24, target: 'enemy' }],
      },
      {
        id: 'scissor',
        label: 'Scissor',
        intent: [
          { kind: 'attack', amount: 9, times: 2, label: 'Scissor' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 9, target: 'enemy', times: 2 },
          /* Two stacks, for the reason Kiln Alpha's Worry gives: the move that
             follows this one plates instead of attacking, so a single stack
             would fall off before anything could collect on it. */
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['mantle', 'gore', 'scissor'] },
    flavor: 'It was never told what the egg was for. It was told to bring it back.',
  },
  {
    id: VARETH_OUTRIDER,
    name: 'Vareth Outrider',
    maxHp: 44,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'lunge',
        label: 'Lunge',
        intent: [{ kind: 'attack', amount: 11, times: 1, label: 'Lunge' }],
        effects: [{ op: 'damage', amount: 11, target: 'enemy' }],
      },
      {
        id: 'harry',
        label: 'Harry',
        intent: [
          { kind: 'attack', amount: 5, times: 2, label: 'Harry' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 5, target: 'enemy', times: 2 },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'brace',
        label: 'Brace',
        intent: [{ kind: 'block', amount: 8, times: 1, label: 'Chitin 8' }],
        effects: [{ op: 'block', amount: 8 }],
      },
    ],
    script: { kind: 'sequence', moves: ['lunge', 'harry', 'brace'] },
    flavor: 'It rides ahead and reports the heading. It is always ahead.',
  },

  /* ---------- act 3: the one that laid it ---------- */
  {
    id: VARETH_MATRIARCH,
    name: 'Vareth Matriarch',
    maxHp: 208,
    act: 3,
    tier: 'elite',
    moves: [
      {
        id: 'shroud',
        label: 'Shroud',
        intent: [
          { kind: 'block', amount: 22, times: 1, label: 'Chitin 22' },
          { kind: 'buff', amount: 3, times: 1, label: 'Strength +3' },
        ],
        effects: [
          { op: 'block', amount: 22 },
          { op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' },
        ],
      },
      {
        id: 'sunder',
        label: 'Sunder',
        intent: [{ kind: 'attack', amount: 34, times: 1, label: 'Sunder' }],
        effects: [{ op: 'damage', amount: 34, target: 'enemy' }],
      },
      {
        /* Three hits, which is where the accumulated Strength is actually
           collected: every stack is paid three times over on this move. It is
           the reason stalling a Matriarch is the losing line. */
        id: 'brood_fury',
        label: 'Brood-Fury',
        intent: [{ kind: 'attack', amount: 11, times: 3, label: 'Brood-Fury' }],
        effects: [{ op: 'damage', amount: 11, target: 'enemy', times: 3 }],
      },
    ],
    script: { kind: 'sequence', moves: ['shroud', 'sunder', 'brood_fury'] },
    flavor: 'She is the reason there was one egg and not none.',
  },
  {
    id: VARETH_CHITINGUARD,
    name: 'Vareth Chitinguard',
    maxHp: 58,
    act: 3,
    tier: 'normal',
    moves: [
      {
        id: 'interpose',
        label: 'Interpose',
        intent: [{ kind: 'block', amount: 12, times: 1, label: 'Chitin 12' }],
        effects: [{ op: 'block', amount: 12 }],
      },
      {
        id: 'crush',
        label: 'Crush',
        intent: [{ kind: 'attack', amount: 16, times: 1, label: 'Crush' }],
        effects: [{ op: 'damage', amount: 16, target: 'enemy' }],
      },
      {
        id: 'rake',
        label: 'Rake',
        intent: [{ kind: 'attack', amount: 7, times: 2, label: 'Rake' }],
        effects: [{ op: 'damage', amount: 7, target: 'enemy', times: 2 }],
      },
    ],
    script: { kind: 'sequence', moves: ['interpose', 'crush', 'rake'] },
    flavor: 'It puts itself between you and her without being asked twice.',
  },
];
