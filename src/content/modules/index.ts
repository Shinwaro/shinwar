/* Ship modules. Data, shapes, and mostly passives.
 *
 * The rework, in one sentence: a module's job is to change what the ship *is*,
 * not to add a button. The old pool was nearly all verbs, which meant the grid
 * did nothing until you pressed something and every ship played the same. Now
 * almost everything here is a passive stat, and the handful of verbs left are a
 * lever on top of a build that is already working.
 *
 * Three things make builds out of that:
 *
 *   1. **Scaling.** A stat that climbs with a pool turns the fight into a curve.
 *      Heat into crit, Singularity into flat damage, Energy into pierce — and a
 *      weapon that generates Heat is what moves you along the first of those.
 *   2. **Adjacency.** Bonuses are keyed to KINDS, so packing is a second puzzle
 *      on top of fitting. Always a bonus for touching, never a requirement.
 *   3. **Shapes.** Real footprints — L, T, S, bars — so the grid is a packing
 *      problem and rotation is a skill rather than an arithmetic check.
 *
 * The chains this pool is built around, so a new module can be checked against
 * something rather than eyeballed:
 *
 *   HEAT     Plasma Cannon -> Pyrometric Lens (Heat into crit) -> Kiln Coupler
 *            (crit hits harder). Runs hot on purpose and wants the overheat line.
 *   VOID     Gravity Manipulator (Energy into Singularity) -> Singularity Core
 *            (Singularity into flat damage) -> Collapse Ring (pierce). Slow, and
 *            unanswerable by turn four.
 *   TURTLE   Reactive Plating + Ablative Wedge + Mirror Facet: reduction, parry
 *            and lifesteal. Wins by still being there.
 *   SWARM    Autoloader Rack (extra shots) + Whetstone Array (flat damage per
 *            shot). Hates shields, adores a broken shield mount.
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
    // An L. It gives more than anything else in the pool and it is a nuisance
    // to place, which is the trade being made in cells rather than in numbers.
    rarity: 'rare',
    footprint: { w: 2, h: 3, mask: ['##', '#.', '##'] },
    effects: [
      { kind: 'produce', resource: 'energy', amount: 6 },
      { kind: 'produce', resource: 'heat', amount: 2 },
    ],
    stats: { flatDamage: 1 },
    flavor: 'More of everything, including the parts you did not want more of.',
  },
  {
    id: 'trickle_cell',
    name: 'Trickle Cell',
    kind: 'reactor',
    rarity: 'common',
    footprint: { w: 1, h: 2 },
    effects: [{ kind: 'produce', resource: 'energy', amount: 2 }],
    adjacentTo: ['reactor', 'converter'],
    adjacencyStats: { shieldPerTurn: 3 },
    flavor: 'Meant to start something bigger. Perfectly happy not to.',
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
    stats: { damageReduction: 1 },
    flavor: 'A cheap loop of pipe doing an expensive job badly.',
  },
  {
    id: 'pyrometric_lens',
    name: 'Pyrometric Lens',
    kind: 'sensor',
    rarity: 'uncommon',
    // A T. Wants to sit in the middle of things, which is also what it is for.
    footprint: { w: 3, h: 2, mask: ['###', '.#.'] },
    effects: [],
    stats: {
      critChance: 0.05,
      scaling: [{ resource: 'heat', stat: 'critChance', per: 0.04, cap: 0.4 }],
    },
    adjacentTo: ['emitter', 'reactor'],
    adjacencyStats: { critBonus: 0.3 },
    flavor: 'Reads the bloom off your own reactor and tells the gun where to be.',
  },
  {
    id: 'kiln_coupler',
    name: 'Kiln Coupler',
    kind: 'converter',
    rarity: 'rare',
    footprint: { w: 2, h: 2, mask: ['#.', '##'] },
    effects: [{ kind: 'produce', resource: 'heat', amount: 2 }],
    stats: { critBonus: 0.6 },
    adjacentTo: ['sensor'],
    adjacencyStats: { critChance: 0.1 },
    flavor: 'It does not aim better. It makes being right matter more.',
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
    stats: { scaling: [{ resource: 'singularity', stat: 'flatDamage', per: 1, cap: 8 }] },
    adjacentTo: ['emitter'],
    adjacencyStats: { scaling: [{ resource: 'singularity', stat: 'pierce', per: 1, cap: 6 }] },
    flavor: 'It is not a weapon. It is an argument the weapon gets to make twice.',
  },
  {
    id: 'collapse_ring',
    name: 'Collapse Ring',
    kind: 'emitter',
    rarity: 'epic',
    // A ring: hollow centre, and something else can live in the hole.
    footprint: { w: 3, h: 3, mask: ['###', '#.#', '###'] },
    effects: [],
    stats: {
      pierce: 4,
      scaling: [{ resource: 'singularity', stat: 'critChance', per: 0.03, cap: 0.25 }],
    },
    adjacentTo: ['emitter', 'sensor'],
    adjacencyStats: { pierce: 4 },
    flavor: 'Shields are a shape. This is an opinion about shapes.',
  },

  /* ---- plating: the turtle ---- */
  {
    id: 'reactive_plating',
    name: 'Reactive Plating',
    kind: 'plating',
    rarity: 'common',
    footprint: { w: 1, h: 2 },
    effects: [{ kind: 'shield', amount: 4 }],
    stats: { damageReduction: 2 },
    grants: 'brace',
    flavor: 'Layered so the outer sheet dies first and loudly.',
  },
  {
    id: 'ablative_wedge',
    name: 'Ablative Wedge',
    kind: 'plating',
    rarity: 'uncommon',
    // An S. Awkward on purpose — the turtle build has to earn its packing.
    footprint: { w: 3, h: 2, mask: ['##.', '.##'] },
    effects: [],
    stats: { damageReduction: 3, parryChance: 0.1 },
    adjacentTo: ['plating'],
    adjacencyStats: { parryChance: 0.15 },
    flavor: 'Boils away a layer at a time. There are a lot of layers.',
  },
  {
    id: 'mirror_facet',
    name: 'Mirror Facet',
    kind: 'plating',
    rarity: 'rare',
    footprint: { w: 2, h: 1 },
    effects: [],
    stats: { parryChance: 0.18, lifesteal: 2 },
    adjacentTo: ['plating', 'sensor'],
    adjacencyStats: { lifesteal: 3 },
    flavor: 'Half of what reaches it goes back the way it came, slightly annoyed.',
  },
  {
    id: 'heat_sink',
    name: 'Heat Sink',
    kind: 'plating',
    rarity: 'common',
    footprint: { w: 1, h: 1 },
    effects: [],
    stats: { damageReduction: 1 },
    grants: 'vent',
    flavor: 'A block of dumb metal that will take one problem off your hands.',
  },

  /* ---- the swarm ---- */
  {
    id: 'autoloader_rack',
    name: 'Autoloader Rack',
    kind: 'emitter',
    rarity: 'rare',
    footprint: { w: 3, h: 2, mask: ['###', '#..'] },
    effects: [],
    stats: { extraShots: 1 },
    adjacentTo: ['reactor'],
    adjacencyStats: { extraShots: 1 },
    flavor: 'Feeds faster than the barrel would like. The barrel is outvoted.',
  },
  {
    id: 'whetstone_array',
    name: 'Whetstone Array',
    kind: 'sensor',
    rarity: 'uncommon',
    footprint: { w: 1, h: 3 },
    effects: [],
    stats: { flatDamage: 2 },
    adjacentTo: ['emitter'],
    adjacencyStats: { flatDamage: 2 },
    flavor: 'Every shot leaves a little sharper than it arrived.',
  },
  {
    id: 'mass_driver',
    name: 'Mass Driver',
    kind: 'emitter',
    rarity: 'uncommon',
    footprint: { w: 3, h: 1 },
    effects: [{ kind: 'damage', amount: 6 }],
    stats: { pierce: 2 },
    adjacentTo: ['reactor'],
    adjacencyEffects: [{ kind: 'damage', amount: 4 }],
    flavor: 'No charge, no beam, no elegance. A rock, very fast.',
  },

  /* ---- sensors and utility ---- */
  {
    id: 'predictive_array',
    name: 'Predictive Array',
    kind: 'sensor',
    rarity: 'uncommon',
    footprint: { w: 1, h: 1 },
    effects: [{ kind: 'amplify', amount: 2 }],
    stats: { critChance: 0.12 },
    grants: 'overcharge',
    flavor: 'It has already watched this fight. It does not enjoy telling you.',
  },
  {
    id: 'ranging_spine',
    name: 'Ranging Spine',
    kind: 'sensor',
    rarity: 'common',
    footprint: { w: 1, h: 2 },
    effects: [],
    stats: { critChance: 0.06, flatDamage: 1 },
    adjacentTo: ['emitter', 'sensor'],
    adjacencyStats: { critChance: 0.06 },
    flavor: 'A metre of very opinionated aerial.',
  },
  {
    id: 'gravitic_anchor',
    name: 'Gravitic Anchor',
    kind: 'drive',
    rarity: 'common',
    footprint: { w: 1, h: 1 },
    effects: [],
    stats: { damageReduction: 1, parryChance: 0.06 },
    grants: 'reposition',
    flavor: 'Hold still. Let the grid move instead.',
  },
  {
    id: 'siphon_web',
    name: 'Siphon Web',
    kind: 'drive',
    rarity: 'epic',
    footprint: { w: 3, h: 3, mask: ['#.#', '###', '#.#'] },
    effects: [],
    stats: {
      lifesteal: 3,
      scaling: [{ resource: 'energy', stat: 'pierce', per: 0.5, cap: 5 }],
    },
    adjacentTo: ['reactor', 'converter', 'emitter', 'plating', 'sensor', 'drive'],
    adjacencyStats: { lifesteal: 2 },
    flavor: 'Touches everything. Takes a little from all of it, including them.',
  },

  /* ---- cargo: does nothing, costs room ---- */
  {
    id: 'clutch_egg',
    name: 'Vareth Clutch',
    kind: 'cargo',
    rarity: 'basic',
    footprint: { w: 1, h: 1 },
    effects: [],
    flavor: 'Warm. Heavier than it looks. Occasionally, it moves.',
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
export const STARTING_PLACEMENT = { moduleId: 'core_reactor', x: 0, y: 0, rot: 0 } as const;
