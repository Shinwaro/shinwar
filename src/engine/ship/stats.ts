/* What the grid adds up to.
 *
 * A module's job is mostly to be a passive, not a button. A grid full of verbs
 * is a grid where the build does nothing until you press something; a grid full
 * of passives is a build that is already working, and the one verb you still
 * get each turn is a lever on top of it rather than the whole game.
 *
 * Two halves, and the split is the interesting part:
 *
 *   - the FLAT contribution of every module on the grid, plus the adjacency
 *     bonuses that are currently live. This is the build you packed.
 *   - the SCALING contribution, read off the pools as they stand right now.
 *     This is the build changing shape while the fight runs: a converter that
 *     turns Heat into crit is a different ship on turn one than on turn five,
 *     and a weapon that generates Heat is what moves it along that curve.
 *
 * Summed in cell order, never array order, so two ships with the same modules
 * in different places resolve identically for a seed.
 */

import type { PlacedModule, ShipResource, ShipStat, ShipStats, ShipState } from '../types.ts';
import { modules as moduleTable } from '../../content/registry.ts';
import { adjacencyActive, cellsOf, neighboursOf } from './grid.ts';

export type ResolvedStats = { readonly [K in ShipStat]: number };

const ZERO: ResolvedStats = {
  critChance: 0,
  critBonus: 0,
  flatDamage: 0,
  damageReduction: 0,
  parryChance: 0,
  pierce: 0,
  shieldPerTurn: 0,
  lifesteal: 0,
  extraShots: 0,
};

const STAT_KEYS = Object.keys(ZERO) as readonly ShipStat[];

/** Placed modules in a stable order: top-left cell first, then by id. */
export function orderedModules(ship: ShipState): readonly PlacedModule[] {
  return [...ship.placed].sort((a, b) => {
    const ca = cellsOf(a)[0] ?? { x: 0, y: 0 };
    const cb = cellsOf(b)[0] ?? { x: 0, y: 0 };
    return ca.y - cb.y || ca.x - cb.x || (a.moduleId < b.moduleId ? -1 : 1);
  });
}

function add(into: ResolvedStats, from: ShipStats | undefined): ResolvedStats {
  if (from === undefined) return into;
  let out = into;
  for (const key of STAT_KEYS) {
    const value = from[key];
    if (value === undefined || value === 0) continue;
    out = { ...out, [key]: out[key] + value };
  }
  return out;
}

/** Everything the grid contributes before the pools are consulted. */
export function flatStats(ship: ShipState): ResolvedStats {
  let out = ZERO;
  for (const placed of orderedModules(ship)) {
    const def = moduleTable.find(placed.moduleId);
    if (def === undefined) continue;
    out = add(out, def.stats);
    if (adjacencyActive(ship, placed.moduleId)) out = add(out, def.adjacencyStats);
  }
  return out;
}

export type Pools = { readonly [K in ShipResource]: number };

/**
 * The grid as it stands *this turn*, pools folded in.
 *
 * Scaling is capped per entry rather than globally: a cap is what keeps a Heat
 * engine from becoming a guaranteed crit by turn six, and putting it on the
 * entry means two different scaling modules stack toward two separate ceilings
 * instead of one shared one.
 */
export function shipStats(ship: ShipState, pools: Pools): ResolvedStats {
  let out = flatStats(ship);

  for (const placed of orderedModules(ship)) {
    const def = moduleTable.find(placed.moduleId);
    if (def === undefined) continue;

    const sets: (ShipStats | undefined)[] = [def.stats];
    if (adjacencyActive(ship, placed.moduleId)) sets.push(def.adjacencyStats);

    for (const set of sets) {
      for (const entry of set?.scaling ?? []) {
        const gained = Math.min(entry.cap, pools[entry.resource] * entry.per);
        if (gained === 0) continue;
        out = { ...out, [entry.stat]: out[entry.stat] + gained };
      }
    }
  }

  return out;
}

/** Which modules a given one is currently drawing an adjacency bonus from. */
export function activeSynergies(ship: ShipState, moduleId: string): readonly string[] {
  const def = moduleTable.find(moduleId);
  const wanted = def?.adjacentTo;
  if (def === undefined || wanted === undefined || wanted.length === 0) return [];

  // `neighboursOf` is the one adjacency rule in the codebase. Re-deriving it
  // here to answer a tooltip is how the tooltip ends up disagreeing with the
  // bonus it is describing.
  return neighboursOf(ship, moduleId)
    .filter((other) => wanted.includes(other.kind))
    .map((other) => other.name);
}
