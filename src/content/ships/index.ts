/* Enemy ships.
 *
 * Simpler than the ground roster on purpose: a ship fight is decided by the
 * build, so the enemy's job is to pose a shape — burst, grind, or armour —
 * rather than a puzzle of its own. Intents telegraph exactly, same as on foot.
 */

import type { ShipEnemyDef } from '../../engine/types.ts';

export const SHIP_ENEMIES: readonly ShipEnemyDef[] = [
  {
    id: 'picket_drone',
    name: 'Picket Drone',
    maxHull: 42,
    act: 1,
    moves: [
      { id: 'strafe', label: 'Strafe', damage: 4, shots: 2, shield: 0 },
      { id: 'harden', label: 'Harden', damage: 0, shots: 0, shield: 8 },
    ],
    script: { kind: 'sequence', moves: ['strafe', 'strafe', 'harden'] },
    subsystems: [
      { id: 'guns', name: 'Gun Pod', hp: 14, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'plates', name: 'Plate Array', hp: 12, disables: 'shields', text: 'Break it and it stops shielding.' },
    ],
    flavor: 'Unmanned, unhurried, and entirely certain you should not be here.',
  },
  {
    id: 'lance_cutter',
    name: 'Lance Cutter',
    maxHull: 58,
    act: 1,
    moves: [
      { id: 'lance', label: 'Lance', damage: 13, shots: 1, shield: 0 },
      { id: 'reposition', label: 'Reposition', damage: 0, shots: 0, shield: 5 },
      { id: 'rake', label: 'Rake', damage: 5, shots: 3, shield: 0 },
    ],
    script: {
      kind: 'weighted',
      entries: [
        { move: 'lance', weight: 3 },
        { move: 'rake', weight: 2 },
        { move: 'reposition', weight: 1 },
      ],
      maxRepeats: 2,
    },
    subsystems: [
      { id: 'lance', name: 'Lance Mount', hp: 20, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'drive', name: 'Drive Cone', hp: 16, disables: 'drive', text: 'Break it and it takes 50% more from every hit.' },
    ],
    flavor: 'Somebody else’s cutter, flown by somebody who kept their sect.',
  },
  {
    id: 'hauler_escort',
    name: 'Hauler Escort',
    maxHull: 80,
    act: 1,
    moves: [
      { id: 'volley', label: 'Volley', damage: 3, shots: 4, shield: 0 },
      { id: 'plate', label: 'Plate', damage: 0, shots: 0, shield: 12 },
      { id: 'ram', label: 'Ram', damage: 16, shots: 1, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['volley', 'plate', 'volley', 'ram'] },
    subsystems: [
      { id: 'battery', name: 'Battery Deck', hp: 22, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'plating', name: 'Belt Plating', hp: 26, disables: 'shields', text: 'Break it and it stops shielding.' },
      { id: 'thrusters', name: 'Thrusters', hp: 18, disables: 'drive', text: 'Break it and it takes 50% more from every hit.' },
    ],
    flavor: 'Built to survive the trip, not to win the argument.',
  },
];
