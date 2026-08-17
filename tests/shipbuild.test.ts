/* Shapes, rotation, and the grid as a build.
 *
 * Two things worth guarding: geometry has to be cell-accurate, because a
 * bounding box gets both packing and adjacency wrong the moment a shape has a
 * notch in it; and the stat aggregation has to be order-independent, so two
 * ships with the same modules in different cells resolve identically for a seed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { ShipState } from '../src/engine/types.ts';
import {
  canPlace,
  distinctRotations,
  firstFit,
  neighboursOf,
  place,
  rotateModule,
  shapeCells,
  sizeOf,
  usedCells,
} from '../src/engine/ship/grid.ts';
import { flatStats, shipStats } from '../src/engine/ship/stats.ts';
import { createRunState } from '../src/engine/state.ts';
import { reloadContent } from '../src/content/index.ts';
import { modules as moduleTable } from '../src/content/registry.ts';

beforeEach(() => {
  reloadContent();
});

function emptyShip(): ShipState {
  return { ...createRunState('SHAPES', 0).ship, placed: [], stored: [], gridW: 6, gridH: 4 };
}

const keys = (cells: readonly { x: number; y: number }[]): string[] =>
  cells.map((cell) => `${cell.x},${cell.y}`).sort();

describe('shapes', () => {
  it('reads a mask as the cells it fills, not as its box', () => {
    // An L: three cells, not the four its 2x2 box would suggest.
    const cells = shapeCells({ w: 2, h: 2, mask: ['#.', '##'] }, 0);
    expect(keys(cells)).toEqual(['0,0', '0,1', '1,1']);
  });

  it('rotates without losing or gaining a cell', () => {
    const shape = { w: 3, h: 2, mask: ['###', '#..'] } as const;
    for (const rot of [0, 1, 2, 3] as const) {
      expect(shapeCells(shape, rot)).toHaveLength(4);
    }
  });

  it('normalises a rotation back to the origin', () => {
    // Whatever it looks like, it always places from its own top-left.
    for (const rot of [0, 1, 2, 3] as const) {
      const cells = shapeCells({ w: 3, h: 2, mask: ['###', '#..'] }, rot);
      expect(Math.min(...cells.map((cell) => cell.x))).toBe(0);
      expect(Math.min(...cells.map((cell) => cell.y))).toBe(0);
    }
  });

  it('reports one orientation for a square and more for an L', () => {
    expect(distinctRotations('core_reactor')).toHaveLength(1);
    expect(distinctRotations('overclock_core').length).toBeGreaterThan(1);
  });

  it('swaps the box when a bar turns', () => {
    expect(sizeOf('mass_driver', 0)).toEqual({ w: 3, h: 1 });
    expect(sizeOf('mass_driver', 1)).toEqual({ w: 1, h: 3 });
  });
});

describe('packing', () => {
  it('lets a shape nest into the notch another one leaves', () => {
    // The Overclock Core is an L with its right-middle cell empty. A 1x1
    // belongs in that hole, and a bounding-box test would refuse it.
    const ship = place(emptyShip(), 'overclock_core', 0, 0);
    expect(canPlace(ship, 'heat_sink', 1, 1).ok).toBe(true);
  });

  it('still refuses a real overlap', () => {
    const ship = place(emptyShip(), 'overclock_core', 0, 0);
    expect(canPlace(ship, 'heat_sink', 0, 1).ok).toBe(false);
  });

  it('counts only the cells a shape actually fills', () => {
    const ship = place(emptyShip(), 'overclock_core', 0, 0);
    expect(usedCells(ship)).toBe(5);
  });

  it('rotates a bar to fit where it otherwise would not', () => {
    const narrow: ShipState = { ...emptyShip(), gridW: 1, gridH: 4 };
    expect(canPlace(narrow, 'mass_driver', 0, 0, 0).ok).toBe(false);
    expect(canPlace(narrow, 'mass_driver', 0, 0, 1).ok).toBe(true);
    expect(firstFit(narrow, 'mass_driver')?.rot).toBe(1);
  });

  it('refuses a rotation in place rather than sliding the module somewhere else', () => {
    // Turning must never quietly undo the packing around it.
    const tight: ShipState = { ...emptyShip(), gridW: 3, gridH: 1 };
    const ship = place(tight, 'mass_driver', 0, 0);
    expect(rotateModule(ship, 'mass_driver')).toBe(ship);
  });
});

describe('adjacency with real shapes', () => {
  it('touches on filled cells, never on corners', () => {
    const edge = place(place(emptyShip(), 'core_reactor', 0, 0), 'heat_sink', 2, 0);
    expect(neighboursOf(edge, 'heat_sink').map((entry) => entry.id)).toEqual(['core_reactor']);

    const corner = place(place(emptyShip(), 'core_reactor', 0, 0), 'heat_sink', 2, 2);
    expect(neighboursOf(corner, 'heat_sink')).toEqual([]);
  });
});

describe('the grid as a build', () => {
  it('sums the passives on the grid', () => {
    const ship = place(place(emptyShip(), 'reactive_plating', 0, 0), 'coolant_lattice', 1, 0);
    // Reactive Plating soaks 2, Coolant Lattice 1.
    expect(flatStats(ship).damageReduction).toBe(3);
  });

  it('pays an adjacency bonus only when the wanted kind is touching', () => {
    // The Wedge is an S filling (0,0) (1,0) (1,1) (2,1). Plating at (0,2) sits
    // under the empty half of it and touches nothing; at (1,2) it meets (1,1).
    // Exactly the case a bounding-box test would get wrong in both directions.
    const apart = place(place(emptyShip(), 'ablative_wedge', 0, 0), 'reactive_plating', 0, 2);
    const together = place(place(emptyShip(), 'ablative_wedge', 0, 0), 'reactive_plating', 1, 2);
    expect(flatStats(together).parryChance).toBeGreaterThan(flatStats(apart).parryChance);
  });

  it('does not depend on the order the modules were placed in', () => {
    const a = place(place(emptyShip(), 'reactive_plating', 0, 0), 'coolant_lattice', 1, 0);
    const b = place(place(emptyShip(), 'coolant_lattice', 1, 0), 'reactive_plating', 0, 0);
    expect(flatStats(a)).toEqual(flatStats(b));
  });

  it('climbs with the pools, and stops at the cap', () => {
    // This is the whole reason a build changes shape mid-fight.
    const ship = place(emptyShip(), 'pyrometric_lens', 0, 0);
    const cold = shipStats(ship, { heat: 0, energy: 0, singularity: 0 });
    const warm = shipStats(ship, { heat: 5, energy: 0, singularity: 0 });
    const cooking = shipStats(ship, { heat: 999, energy: 0, singularity: 0 });

    expect(warm.critChance).toBeGreaterThan(cold.critChance);
    expect(cooking.critChance).toBeLessThan(1);
    expect(cooking.critChance).toBe(
      shipStats(ship, { heat: 500, energy: 0, singularity: 0 }).critChance,
    );
  });
});

describe('the module pool, as builds', () => {
  it('is mostly passives rather than buttons', () => {
    // A grid full of verbs is a grid where the build does nothing until you
    // press something.
    const all = moduleTable.all().filter((def) => def.kind !== 'cargo');
    const withStats = all.filter((def) => Object.keys(def.stats ?? {}).length > 0);
    expect(withStats.length).toBeGreaterThan(all.length / 2);
  });

  it('keeps a few verbs, so a turn still has a lever', () => {
    const verbs = moduleTable.all().filter((def) => def.grants !== undefined);
    expect(verbs.length).toBeGreaterThanOrEqual(3);
  });

  it('caps every scaling entry, so no pool becomes a guaranteed crit', () => {
    for (const def of moduleTable.all()) {
      const entries = [...(def.stats?.scaling ?? []), ...(def.adjacencyStats?.scaling ?? [])];
      for (const entry of entries) {
        expect(entry.cap, `${def.id} scaling is uncapped`).toBeGreaterThan(0);
        expect(entry.per, `${def.id} scaling does nothing`).not.toBe(0);
      }
    }
  });

  it('never declares an adjacency bonus without saying what it wants', () => {
    for (const def of moduleTable.all()) {
      const hasBonus =
        def.adjacencyEffects !== undefined || Object.keys(def.adjacencyStats ?? {}).length > 0;
      if (!hasBonus) continue;
      expect(def.adjacentTo?.length ?? 0, `${def.id} has a bonus with no partner`).toBeGreaterThan(0);
    }
  });
});
