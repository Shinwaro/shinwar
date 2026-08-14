/* Act 1 enemies.
 *
 * Bands from DESIGN.md §8: 20-45 HP, 6-12 damage a turn. Each one asks a
 * different question, so the fight is not "play your best card three times":
 *
 *   Scrap Hound  — unpredictable within a readable range. Do you block for 9
 *                  or for 8? Its repeat cap means you are never guessing blind.
 *   Lathe Drone  — a fixed cycle you can learn. Blocks itself, then blunts you.
 *                  Rewards remembering where in the loop it is.
 *   Cinder Wisp  — barely a threat in damage, but it feeds you Heat. It is the
 *                  reason to kill something fast rather than grind, and it is
 *                  how a first-time player meets the overheat threshold.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { STRENGTH, WEAK } from '../statuses.ts';

export const SCRAP_HOUND = 'scrap_hound';
export const LATHE_DRONE = 'lathe_drone';
export const CINDER_WISP = 'cinder_wisp';

export const ACT1_ENEMIES: readonly EnemyDef[] = [
  {
    id: SCRAP_HOUND,
    name: 'Scrap Hound',
    maxHp: 30,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'bite',
        label: 'Bite',
        intent: [{ kind: 'attack', amount: 9, times: 1, label: 'Bite' }],
        effects: [{ op: 'damage', amount: 9, target: 'enemy' }],
      },
      {
        id: 'snap',
        label: 'Snap',
        intent: [{ kind: 'attack', amount: 4, times: 2, label: 'Snap' }],
        effects: [{ op: 'damage', amount: 4, target: 'enemy', times: 2 }],
      },
    ],
    script: {
      kind: 'weighted',
      entries: [
        { move: 'bite', weight: 2 },
        { move: 'snap', weight: 1 },
      ],
      maxRepeats: 2,
    },
    flavor: 'Someone welded a cutting torch to a mining drone. It kept the appetite.',
  },

  {
    id: LATHE_DRONE,
    name: 'Lathe Drone',
    maxHp: 36,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'strike',
        label: 'Strike',
        intent: [{ kind: 'attack', amount: 7, times: 1, label: 'Strike' }],
        effects: [{ op: 'damage', amount: 7, target: 'enemy' }],
      },
      {
        id: 'plate',
        label: 'Plate',
        intent: [{ kind: 'block', amount: 8, times: 1, label: 'Plate 8' }],
        effects: [{ op: 'block', amount: 8 }],
      },
      {
        id: 'sap',
        label: 'Sap',
        intent: [{ kind: 'debuff', amount: 1, times: 1, label: 'Weak 1' }],
        effects: [{ op: 'applyStatus', status: WEAK, stacks: 1, target: 'enemy' }],
      },
    ],
    script: { kind: 'sequence', moves: ['strike', 'plate', 'sap'] },
    flavor: 'Still running the maintenance loop. The station it maintained is gone.',
  },

  {
    id: CINDER_WISP,
    name: 'Cinder Wisp',
    maxHp: 22,
    act: 1,
    tier: 'normal',
    moves: [
      {
        id: 'ignite',
        label: 'Ignite',
        intent: [
          { kind: 'attack', amount: 5, times: 1, label: 'Ignite' },
          { kind: 'debuff', amount: 2, times: 1, label: 'Heat +2' },
        ],
        effects: [
          { op: 'damage', amount: 5, target: 'enemy' },
          { op: 'gainHeat', amount: 2 },
        ],
      },
      {
        id: 'stoke',
        label: 'Stoke',
        intent: [
          { kind: 'buff', amount: 1, times: 1, label: 'Strength +1' },
          { kind: 'debuff', amount: 1, times: 1, label: 'Heat +1' },
        ],
        effects: [
          { op: 'applyStatus', status: STRENGTH, stacks: 1, target: 'self' },
          { op: 'gainHeat', amount: 1 },
        ],
      },
    ],
    script: { kind: 'sequence', moves: ['ignite', 'stoke'] },
    flavor: 'It has no weapons. It simply will not let you radiate.',
  },
];
