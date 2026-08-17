/* Act 2 enemies.
 *
 * Bands from DESIGN.md §8: 45-80 HP, 12-20 damage a turn, elites 130-170.
 *
 * Act 2 is where the player is supposed to feel powerful and then greedy, so
 * these are not simply Act 1 with bigger numbers — each one taxes a resource
 * rather than just spending HP:
 *
 *   Sable Drifter  — pure damage, but only every other turn. The turn it does
 *                    not hit is the turn you are supposed to overreach.
 *   Arc Welder     — armours itself on a fixed cycle. Punishes chip damage and
 *                    rewards saving a big swing for the gap in the cycle.
 *   Ash Choir      — weak alone; it buffs whatever it is standing next to.
 *   Void Ronin     — mirrors the stance layer back at you. Hits harder the
 *                    longer you sit still.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { STRENGTH, VULNERABLE, WEAK } from '../statuses.ts';

export const SABLE_DRIFTER = 'sable_drifter';
export const ARC_WELDER = 'arc_welder';
export const ASH_CHOIR = 'ash_choir';
export const VOID_RONIN = 'void_ronin';

export const IRON_PROCESSION = 'iron_procession';
export const SIPHON_ENGINE = 'siphon_engine';
export const WAVEFRONT_HERALD = 'wavefront_herald';

export const ACT2_ENEMIES: readonly EnemyDef[] = [
  {
    id: SABLE_DRIFTER,
    name: 'Sable Drifter',
    maxHp: 58,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'lunge',
        label: 'Lunge',
        intent: [{ kind: 'attack', amount: 16, times: 1, label: 'Lunge' }],
        effects: [{ op: 'damage', amount: 16, target: 'enemy' }],
      },
      {
        id: 'drift',
        label: 'Drift',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Strength +2' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' }],
      },
    ],
    script: { kind: 'sequence', moves: ['drift', 'lunge'] },
    flavor: 'It does not accelerate. It decides where it already was.',
  },

  {
    id: ARC_WELDER,
    name: 'Arc Welder',
    maxHp: 72,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'seal',
        label: 'Seal',
        intent: [{ kind: 'block', amount: 14, times: 1, label: 'Plate 14' }],
        effects: [{ op: 'block', amount: 14 }],
      },
      {
        id: 'arc',
        label: 'Arc',
        intent: [
          { kind: 'attack', amount: 6, times: 2, label: 'Arc' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'damage', amount: 6, target: 'enemy', times: 2 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'grind',
        label: 'Grind',
        intent: [{ kind: 'attack', amount: 13, times: 1, label: 'Grind' }],
        effects: [{ op: 'damage', amount: 13, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['seal', 'arc', 'grind'] },
    flavor: 'Repairs itself with the same torch it uses on you. No irony intended.',
  },

  {
    id: ASH_CHOIR,
    name: 'Ash Choir',
    maxHp: 46,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'hymn',
        label: 'Hymn',
        intent: [{ kind: 'buff', amount: 2, times: 1, label: 'Strength +2 to all' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'allEnemies' }],
      },
      {
        id: 'dirge',
        label: 'Dirge',
        intent: [
          { kind: 'attack', amount: 8, times: 1, label: 'Dirge' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' },
        ],
        effects: [
          { op: 'damage', amount: 8, target: 'enemy' },
          { op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['hymn', 'dirge'] },
    flavor: 'Singing the names of a crew that has not finished dying yet.',
  },

  {
    id: VOID_RONIN,
    name: 'Void Ronin',
    maxHp: 64,
    act: 2,
    tier: 'normal',
    moves: [
      {
        id: 'draw_cut',
        label: 'Draw Cut',
        intent: [{ kind: 'attack', amount: 18, times: 1, label: 'Draw Cut' }],
        effects: [{ op: 'damage', amount: 18, target: 'enemy' }],
      },
      {
        id: 'guard_form',
        label: 'Guard Form',
        intent: [
          { kind: 'block', amount: 10, times: 1, label: 'Guard 10' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Vulnerable 1' },
        ],
        effects: [
          { op: 'block', amount: 10 },
          { op: 'applyStatus', status: VULNERABLE, stacks: 1, target: 'enemy' },
        ],
      },
      {
        id: 'sheathe',
        label: 'Sheathe',
        intent: [{ kind: 'buff', amount: 3, times: 1, label: 'Strength +3' }],
        effects: [{ op: 'applyStatus', status: STRENGTH, stacks: 3, target: 'self' }],
      },
    ],
    script: { kind: 'sequence', moves: ['guard_form', 'sheathe', 'draw_cut'] },
    flavor: 'Another sect, another collapse. They kept the forms and lost the reason.',
  },

  /* ---- elites: 130-170 HP, 22-30 a turn ---- */

  {
    id: IRON_PROCESSION,
    name: 'Iron Procession',
    maxHp: 148,
    act: 2,
    tier: 'elite',
    moves: [
      {
        id: 'advance',
        label: 'Advance',
        intent: [
          { kind: 'attack', amount: 11, times: 2, label: 'Advance' },
          { kind: 'block', amount: 12, times: 1, label: 'Plate 12' },
        ],
        effects: [
          { op: 'damage', amount: 11, target: 'enemy', times: 2 },
          { op: 'block', amount: 12 },
        ],
      },
      {
        id: 'toll',
        label: 'Toll',
        intent: [
          { kind: 'attack', amount: 24, times: 1, label: 'Toll' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Vulnerable 2' },
        ],
        effects: [
          { op: 'damage', amount: 24, target: 'enemy' },
          { op: 'applyStatus', status: VULNERABLE, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'reform',
        label: 'Reform',
        intent: [
          { kind: 'block', amount: 20, times: 1, label: 'Plate 20' },
          { kind: 'buff', amount: 2, times: 1, label: 'Strength +2' },
        ],
        effects: [
          { op: 'block', amount: 20 },
          { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['advance', 'reform', 'toll'] },
    flavor: 'Nine hulls welded nose to tail, still keeping formation out of habit.',
  },

  {
    id: SIPHON_ENGINE,
    name: 'Siphon Engine',
    maxHp: 136,
    act: 2,
    tier: 'elite',
    moves: [
      {
        id: 'draw_off',
        label: 'Draw Off',
        intent: [
          { kind: 'attack', amount: 14, times: 1, label: 'Draw Off' },
          { kind: 'debuff', amount: 3, times: 1, label: 'Heat +3' },
        ],
        effects: [
          { op: 'damage', amount: 14, target: 'enemy' },
          { op: 'gainHeat', amount: 3 },
        ],
      },
      {
        id: 'overpressure',
        label: 'Overpressure',
        intent: [{ kind: 'attack', amount: 9, times: 3, label: 'Overpressure' }],
        effects: [{ op: 'damage', amount: 9, target: 'enemy', times: 3 }],
      },
      {
        id: 'bank',
        label: 'Bank',
        intent: [
          { kind: 'block', amount: 16, times: 1, label: 'Plate 16' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'block', amount: 16 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['draw_off', 'bank', 'overpressure'] },
    flavor: 'It is not attacking you. It is drinking, and you are the nearest reactor.',
  },

  /* ---- the Act 2 boss: 220-260 HP, 28-38 a turn ----
     A culmination, not a curveball. It asks the two questions Act 2 has been
     asking all along — can you survive a turn you cannot block, and can you
     keep the gauge down when something else is filling it. */

  {
    id: WAVEFRONT_HERALD,
    name: 'Herald of the Front',
    maxHp: 238,
    act: 2,
    tier: 'boss',
    moves: [
      {
        id: 'shockfall',
        label: 'Shockfall',
        intent: [
          { kind: 'attack', amount: 12, times: 3, label: 'Shockfall' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'damage', amount: 12, target: 'enemy', times: 3 },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'compression',
        label: 'Compression',
        intent: [
          { kind: 'block', amount: 24, times: 1, label: 'Plate 24' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Weak 2' },
        ],
        effects: [
          { op: 'block', amount: 24 },
          { op: 'applyStatus', status: WEAK, stacks: 2, target: 'enemy' },
        ],
      },
      {
        id: 'arrival',
        label: 'Arrival',
        intent: [
          { kind: 'attack', amount: 34, times: 1, label: 'Arrival' },
          { kind: 'buff', amount: 2, times: 1, label: 'Strength +2' },
        ],
        effects: [
          { op: 'damage', amount: 34, target: 'enemy' },
          { op: 'applyStatus', status: STRENGTH, stacks: 2, target: 'self' },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['shockfall', 'compression', 'arrival'] },
    flavor: 'It arrived here first. It has been waiting for the rest of the front to catch up.',
  },
];
