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
  /* ---------- Act 2 ----------
     Bigger hulls and a real subsystem decision: everything here punishes going
     straight for the hull when a mount is what is actually hurting you. */
  {
    id: 'reach_corsair',
    name: 'Reach Corsair',
    maxHull: 105,
    act: 2,
    moves: [
      { id: 'raking', label: 'Raking Pass', damage: 7, shots: 3, shield: 0 },
      { id: 'skim', label: 'Skim', damage: 0, shots: 0, shield: 14 },
      { id: 'broadside', label: 'Broadside', damage: 22, shots: 1, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['raking', 'skim', 'broadside'] },
    subsystems: [
      { id: 'rails', name: 'Rail Mounts', hp: 26, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'skirt', name: 'Deflector Skirt', hp: 22, disables: 'shields', text: 'Break it and it stops shielding.' },
      { id: 'vanes', name: 'Steering Vanes', hp: 20, disables: 'drive', text: 'Break it and it takes 50% more from every hit.' },
    ],
    flavor: 'Fast, thin, and crewed by people who have never once broken off.',
  },
  {
    id: 'siege_tender',
    name: 'Siege Tender',
    maxHull: 140,
    act: 2,
    moves: [
      { id: 'bank', label: 'Bank Plates', damage: 0, shots: 0, shield: 20 },
      { id: 'lob', label: 'Lob', damage: 26, shots: 1, shield: 0 },
      { id: 'spray', label: 'Spray', damage: 6, shots: 4, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['bank', 'lob', 'spray'] },
    subsystems: [
      { id: 'mortar', name: 'Mortar Deck', hp: 34, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'belt', name: 'Plate Belt', hp: 30, disables: 'shields', text: 'Break it and it stops shielding.' },
    ],
    flavor: 'It does not manoeuvre. It arrives, and then it is a problem.',
  },

  /* ---------- Act 3 ----------
     Enough hull that a build which cannot break a mount will not finish the
     fight before the fight finishes it. */
  {
    id: 'wavefront_picket',
    name: 'Wavefront Picket',
    maxHull: 165,
    act: 3,
    moves: [
      { id: 'shear', label: 'Shear', damage: 11, shots: 3, shield: 0 },
      { id: 'fold', label: 'Fold', damage: 0, shots: 0, shield: 24 },
      { id: 'collapse', label: 'Collapse', damage: 34, shots: 1, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['shear', 'fold', 'collapse'] },
    subsystems: [
      { id: 'emitters', name: 'Shear Emitters', hp: 38, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'fold_core', name: 'Fold Core', hp: 32, disables: 'shields', text: 'Break it and it stops shielding.' },
      { id: 'drive', name: 'Drive Spine', hp: 30, disables: 'drive', text: 'Break it and it takes 50% more from every hit.' },
    ],
    flavor: 'Riding the front rather than running from it. It has made its peace.',
  },
  {
    id: 'horizon_keeper',
    name: 'Horizon Keeper',
    maxHull: 210,
    act: 3,
    moves: [
      { id: 'sweep', label: 'Sweep', damage: 9, shots: 5, shield: 0 },
      { id: 'anchor', label: 'Anchor', damage: 0, shots: 0, shield: 30 },
      { id: 'sink', label: 'Sink', damage: 42, shots: 1, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['anchor', 'sweep', 'sink'] },
    subsystems: [
      { id: 'battery', name: 'Keeper Battery', hp: 44, disables: 'guns', text: 'Break it and its shots hit for half.' },
      { id: 'anchor_ring', name: 'Anchor Ring', hp: 40, disables: 'shields', text: 'Break it and it stops shielding.' },
      { id: 'spine', name: 'Drive Spine', hp: 36, disables: 'drive', text: 'Break it and it takes 50% more from every hit.' },
    ],
    flavor: 'Parked at the edge for a century, keeping something in rather than out.',
  },
];
