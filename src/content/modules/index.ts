/* Ship modules. Data, and rectangles.
 *
 * Modules are not stat sticks — they produce and consume resources, and the
 * interesting builds are chains where one module's output is another's input.
 * The worked example from SHIP.md, which these implement:
 *
 *   Plasma Cannon generates Heat -> Thermal Converter turns Heat into Energy
 *   -> Gravity Manipulator spends Energy for Singularity -> Singularity makes
 *   the Plasma Cannon hit harder.
 *
 * Adjacency is a bonus for touching, never a requirement to function. A badly
 * packed ship is weaker; it is never broken.
 */

import type { ModuleDef, WeaponDef } from '../../engine/types.ts';

export const MODULES: readonly ModuleDef[] = [
  /* ---- reactors: the power floor ---- */
  {
    id: 'core_reactor',
    name: 'Core Reactor',
    kind: 'reactor',
    rarity: 'basic',
    footprint: { w: 2, h: 2 },
    effects: [{ kind: 'produce', resource: 'energy', amount: 3 }],
    flavor: 'Salvage-grade. It complains, and it holds.',
  },
  {
    id: 'overclock_core',
    name: 'Overclock Core',
    kind: 'reactor',
    rarity: 'rare',
    footprint: { w: 2, h: 3 },
    effects: [
      { kind: 'produce', resource: 'energy', amount: 6 },
      // Capacity is itself a trade-off — DESIGN.md §2.
      { kind: 'produce', resource: 'heat', amount: 2 },
    ],
    flavor: 'More of everything, including the parts you did not want more of.',
  },

  /* ---- converters: turn a drawback into an input ---- */
  {
    id: 'thermal_converter',
    name: 'Thermal Converter',
    kind: 'converter',
    rarity: 'uncommon',
    footprint: { w: 1, h: 2 },
    effects: [{ kind: 'convert', from: 'heat', to: 'energy', rate: 1, cap: 3 }],
    adjacentTo: ['reactor', 'emitter'],
    adjacencyEffects: [{ kind: 'convert', from: 'heat', to: 'energy', rate: 1, cap: 2 }],
    flavor: 'The waste was always the fuel. Nobody had the plumbing for it.',
  },
  {
    id: 'coolant_lattice',
    name: 'Coolant Lattice',
    kind: 'plating',
    rarity: 'common',
    footprint: { w: 1, h: 1 },
    effects: [{ kind: 'convert', from: 'heat', to: 'energy', rate: 1, cap: 1 }],
    flavor: 'A cheap loop of pipe doing an expensive job badly.',
  },

  /* ---- emitters: the Singularity chain ---- */
  {
    id: 'gravity_manipulator',
    name: 'Gravity Manipulator',
    kind: 'emitter',
    rarity: 'uncommon',
    footprint: { w: 2, h: 1 },
    effects: [{ kind: 'convert', from: 'energy', to: 'singularity', rate: 2, cap: 2 }],
    grants: 'divert',
    flavor: 'Bend the space in front of them. Everything else is arithmetic.',
  },
  {
    id: 'singularity_core',
    name: 'Singularity Core',
    kind: 'emitter',
    rarity: 'rare',
    footprint: { w: 2, h: 2 },
    effects: [{ kind: 'amplify', amount: 0, perResource: 'singularity', per: 1 }],
    adjacentTo: ['emitter'],
    adjacencyEffects: [{ kind: 'amplify', amount: 0, perResource: 'singularity', per: 1 }],
    flavor: 'It is not a weapon. It is an argument the weapon gets to make twice.',
  },

  /* ---- plating and utility ---- */
  {
    id: 'reactive_plating',
    name: 'Reactive Plating',
    kind: 'plating',
    rarity: 'common',
    footprint: { w: 1, h: 2 },
    effects: [{ kind: 'shield', amount: 4 }],
    grants: 'brace',
    flavor: 'Layered so the outer sheet dies first and loudly.',
  },
  {
    id: 'heat_sink',
    name: 'Heat Sink',
    kind: 'plating',
    rarity: 'common',
    footprint: { w: 1, h: 1 },
    effects: [],
    grants: 'vent',
    flavor: 'A block of dumb metal that will take one problem off your hands.',
  },
  {
    id: 'mass_driver',
    name: 'Mass Driver',
    kind: 'emitter',
    rarity: 'uncommon',
    footprint: { w: 3, h: 1 },
    effects: [{ kind: 'damage', amount: 6 }],
    adjacentTo: ['reactor'],
    adjacencyEffects: [{ kind: 'damage', amount: 4 }],
    flavor: 'No charge, no beam, no elegance. A rock, very fast.',
  },
  {
    id: 'predictive_array',
    name: 'Predictive Array',
    kind: 'sensor',
    rarity: 'uncommon',
    footprint: { w: 1, h: 1 },
    effects: [{ kind: 'amplify', amount: 2 }],
    grants: 'overcharge',
    flavor: 'It has already watched this fight. It does not enjoy telling you.',
  },
  {
    id: 'gravitic_anchor',
    name: 'Gravitic Anchor',
    kind: 'drive',
    rarity: 'common',
    footprint: { w: 1, h: 1 },
    effects: [],
    grants: 'reposition',
    flavor: 'Hold still. Let the grid move instead.',
  },
];

/* ---- weapons: mounted, not on the grid ---- */

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'rail_repeater',
    name: 'Rail Repeater',
    rarity: 'basic',
    damage: 4,
    shots: 2,
    heat: 1,
    flavor: 'Standard fit. Fires until told otherwise, which is its whole charm.',
  },
  {
    id: 'plasma_cannon',
    name: 'Plasma Cannon',
    rarity: 'uncommon',
    damage: 11,
    shots: 1,
    heat: 3,
    flavor: 'It runs hot because it is, briefly, a star.',
  },
  {
    id: 'lance_battery',
    name: 'Lance Battery',
    rarity: 'rare',
    damage: 5,
    shots: 3,
    heat: 2,
    flavor: 'Three thin holes are worth more than one wide one.',
  },
];

export const STARTING_WEAPON = 'rail_repeater';
/** One module, already bolted in. The cutter is salvage, not a kit. */
export const STARTING_MODULES: readonly string[] = ['core_reactor'];
export const STARTING_PLACEMENT = { moduleId: 'core_reactor', x: 0, y: 0 } as const;
