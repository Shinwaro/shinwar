/* Enemy ships.
 *
 * Every one of them runs the same module pool the player does, packed onto a
 * grid you can see. That is the whole design: what the ship is doing to you is
 * legible by looking at it, and knocking a cell out changes its build exactly
 * the way losing one changes yours.
 *
 * A ship is therefore three things — a hull, a grid, and a small move script.
 * The moves are the telegraphed part; the grid is the constant pressure
 * underneath it. Intents commit at telegraph time, same as on foot.
 *
 * Hulls and damage are both tuned against `npm run shipsim`, which drives the
 * real engine rather than a model of it. The bands: six to twelve turns, a real
 * build clearing Act 1 comfortably and sweating in Act 3, and a bare grid
 * losing.
 *
 * Hulls are deliberately modest and the durability lives in the GRID instead —
 * plating that soaks, a wedge that parries. That is the whole reason the strike
 * is a decision: a big hull number is something you grind through, a plating
 * module is something you can choose to turn off.
 */

import type { ShipEnemyDef } from '../../engine/types.ts';

export const SHIP_ENEMIES: readonly ShipEnemyDef[] = [
  /* ---------- Act 1 ----------
     Small grids with one obvious thing worth turning off, so the strike teaches
     itself on the first fight. */
  {
    id: 'picket_drone',
    name: 'Picket Drone',
    maxHull: 95,
    act: 1,
    gridW: 3,
    gridH: 2,
    modules: ['ranging_spine', 'coolant_lattice'],
    moves: [
      { id: 'strafe', label: 'Strafe', damage: 4, shots: 2, shield: 0 },
      { id: 'harden', label: 'Harden', damage: 0, shots: 0, shield: 10 },
    ],
    script: { kind: 'sequence', moves: ['strafe', 'strafe', 'harden'] },
    flavor: 'Cheap, patient, and bolted together from two better things.',
  },
  {
    id: 'lance_cutter',
    name: 'Lance Cutter',
    maxHull: 120,
    act: 1,
    gridW: 3,
    gridH: 3,
    modules: ['whetstone_array', 'reactive_plating', 'heat_sink'],
    moves: [
      { id: 'lance', label: 'Lance', damage: 13, shots: 1, shield: 0 },
      { id: 'reposition', label: 'Reposition', damage: 0, shots: 0, shield: 7 },
      { id: 'rake', label: 'Rake', damage: 5, shots: 3, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['rake', 'reposition', 'lance'] },
    flavor: 'One long gun and a crew that believes in it.',
  },
  {
    id: 'hauler_escort',
    name: 'Hauler Escort',
    maxHull: 145,
    act: 1,
    gridW: 4,
    gridH: 2,
    modules: ['reactive_plating', 'coolant_lattice', 'ranging_spine'],
    moves: [
      { id: 'volley', label: 'Volley', damage: 4, shots: 3, shield: 0 },
      { id: 'plate', label: 'Plate', damage: 0, shots: 0, shield: 14 },
      { id: 'ram', label: 'Ram', damage: 15, shots: 1, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['plate', 'volley', 'ram'] },
    flavor: 'Built to survive the trip, not to win the argument.',
  },

  /* ---------- Act 2 ----------
     Wider grids and the first ships that reach into yours. The disabling move
     is telegraphed a turn ahead, so it is a reason to have packed a spare
     rather than a tax you cannot see coming. */
  {
    id: 'reach_corsair',
    name: 'Reach Corsair',
    maxHull: 150,
    act: 2,
    gridW: 4,
    gridH: 3,
    modules: ['whetstone_array', 'ranging_spine', 'ablative_wedge'],
    moves: [
      { id: 'raking', label: 'Raking Pass', damage: 7, shots: 3, shield: 0 },
      { id: 'skim', label: 'Skim', damage: 0, shots: 0, shield: 16 },
      { id: 'shear', label: 'Shear Charge', damage: 9, shots: 1, shield: 0, disables: true },
    ],
    script: { kind: 'sequence', moves: ['raking', 'skim', 'shear'] },
    flavor: 'Fast, thin, and crewed by people who have never once broken off.',
  },
  {
    id: 'siege_tender',
    name: 'Siege Tender',
    maxHull: 175,
    act: 2,
    gridW: 4,
    gridH: 3,
    modules: ['reactive_plating', 'ablative_wedge', 'coolant_lattice', 'whetstone_array'],
    moves: [
      { id: 'bank', label: 'Bank Plates', damage: 0, shots: 0, shield: 22 },
      { id: 'lob', label: 'Lob', damage: 18, shots: 1, shield: 0 },
      { id: 'spray', label: 'Spray', damage: 6, shots: 3, shield: 0 },
    ],
    script: { kind: 'sequence', moves: ['bank', 'lob', 'spray'] },
    flavor: 'It does not manoeuvre. It arrives, and then it is a problem.',
  },

  /* ---------- Act 3 ----------
     Grids dense enough that you cannot turn all of it off, so the strike stops
     being "disable the best thing" and starts being "which of these can I
     afford to leave running". */
  {
    id: 'wavefront_picket',
    name: 'Wavefront Picket',
    maxHull: 175,
    act: 3,
    gridW: 4,
    gridH: 3,
    modules: ['pyrometric_lens', 'whetstone_array', 'mirror_facet', 'heat_sink'],
    moves: [
      { id: 'shear', label: 'Shear', damage: 6, shots: 3, shield: 0 },
      { id: 'fold', label: 'Fold', damage: 0, shots: 0, shield: 20 },
      { id: 'collapse', label: 'Collapse', damage: 13, shots: 1, shield: 0, disables: true },
    ],
    script: { kind: 'sequence', moves: ['shear', 'fold', 'collapse'] },
    flavor: 'Riding the front rather than running from it. It has made its peace.',
  },
  {
    id: 'horizon_keeper',
    name: 'Horizon Keeper',
    maxHull: 200,
    act: 3,
    gridW: 5,
    gridH: 3,
    modules: ['ablative_wedge', 'mirror_facet', 'whetstone_array', 'ranging_spine', 'coolant_lattice'],
    moves: [
      { id: 'sweep', label: 'Sweep', damage: 6, shots: 4, shield: 0 },
      { id: 'anchor', label: 'Anchor', damage: 0, shots: 0, shield: 22 },
      { id: 'sink', label: 'Sink', damage: 18, shots: 1, shield: 0 },
      { id: 'strip', label: 'Strip', damage: 6, shots: 2, shield: 0, disables: true },
    ],
    script: { kind: 'sequence', moves: ['anchor', 'sweep', 'sink', 'strip'] },
    flavor: 'Parked at the edge for a century, keeping something in rather than out.',
  },
];
