/* The ship grid.
 *
 * Space is the constraint that replaced the Power budget, so the placement
 * rules carry the same weight the budget check used to: a rejection must come
 * with a reason, and a module must never end up half on the board.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { ShipState } from '../src/engine/types.ts';
import {
  adjacencyActive,
  canPlace,
  cellsOf,
  firstFit,
  freeCells,
  moveModule,
  neighboursOf,
  place,
  unplace,
  usedCells,
} from '../src/engine/ship/grid.ts';
import { createRunState } from '../src/engine/state.ts';
import { reloadContent } from '../src/content/index.ts';
import { modules as moduleTable } from '../src/content/registry.ts';
import { SHIP } from '../src/content/balance.ts';

beforeEach(() => {
  reloadContent();
});

function emptyShip(): ShipState {
  return { ...createRunState('GRID', 0).ship, placed: [], stored: [] };
}

describe('placement', () => {
  it('starts empty at the configured size', () => {
    const ship = emptyShip();
    expect(ship.gridW).toBe(SHIP.gridW);
    expect(ship.gridH).toBe(SHIP.gridH);
    expect(freeCells(ship)).toBe(SHIP.gridW * SHIP.gridH);
  });

  it('occupies exactly its footprint', () => {
    const ship = place(emptyShip(), 'core_reactor', 0, 0);
    expect(usedCells(ship)).toBe(4);
    expect(cellsOf(ship.placed[0]!).map((c) => `${c.x},${c.y}`).sort()).toEqual([
      '0,0',
      '0,1',
      '1,0',
      '1,1',
    ]);
  });

  it('refuses to hang off the edge, and says so', () => {
    const ship = emptyShip();
    const check = canPlace(ship, 'core_reactor', SHIP.gridW - 1, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/does not fit/);
    expect(place(ship, 'core_reactor', SHIP.gridW - 1, 0)).toBe(ship);
  });

  it('refuses to overlap, and names what is in the way', () => {
    const ship = place(emptyShip(), 'core_reactor', 0, 0);
    const check = canPlace(ship, 'thermal_converter', 1, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Core Reactor/);
  });

  it('refuses negative coordinates', () => {
    expect(canPlace(emptyShip(), 'heat_sink', -1, 0).ok).toBe(false);
  });

  it('un-placing is always free and returns the module to storage', () => {
    const ship = place(emptyShip(), 'core_reactor', 0, 0);
    const pulled = unplace(ship, 'core_reactor');
    expect(pulled.placed).toHaveLength(0);
    expect(pulled.stored).toContain('core_reactor');
    expect(freeCells(pulled)).toBe(SHIP.gridW * SHIP.gridH);
  });

  it('moves a module without colliding with the space it is leaving', () => {
    const ship = place(emptyShip(), 'core_reactor', 0, 0);
    const moved = moveModule(ship, 'core_reactor', 1, 1);
    expect(moved.placed[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('finds the first free spot, or reports that there is none', () => {
    let ship = emptyShip();
    expect(firstFit(ship, 'core_reactor')).toEqual({ x: 0, y: 0 });

    // Fill the board with 1x1s.
    for (let y = 0; y < ship.gridH; y++) {
      for (let x = 0; x < ship.gridW; x++) {
        ship = { ...ship, placed: [...ship.placed, { moduleId: `filler${x}_${y}`, x, y }] };
      }
    }
    // `filler` ids do not exist, so use a real one against a full board.
    const full = { ...emptyShip(), placed: [{ moduleId: 'overclock_core', x: 0, y: 0 }] };
    expect(firstFit(full, 'overclock_core')).toEqual({ x: 2, y: 0 });
  });
});

describe('adjacency', () => {
  it('counts edges, not corners', () => {
    // Reactor at 0,0 is 2x2. A 1x1 at 2,0 shares an edge; one at 2,2 only a corner.
    const edge = place(place(emptyShip(), 'core_reactor', 0, 0), 'heat_sink', 2, 0);
    expect(neighboursOf(edge, 'heat_sink').map((m) => m.id)).toEqual(['core_reactor']);

    const corner = place(place(emptyShip(), 'core_reactor', 0, 0), 'heat_sink', 2, 2);
    expect(neighboursOf(corner, 'heat_sink')).toEqual([]);
  });

  it('lights the bonus only when the wanted kind is touching', () => {
    // Thermal Converter wants a reactor or an emitter.
    const alone = place(emptyShip(), 'thermal_converter', 4, 0);
    expect(adjacencyActive(alone, 'thermal_converter')).toBe(false);

    const paired = place(place(emptyShip(), 'core_reactor', 0, 0), 'thermal_converter', 2, 0);
    expect(adjacencyActive(paired, 'thermal_converter')).toBe(true);
  });

  it('is a bonus, never a requirement — an unpaired module still works', () => {
    const alone = place(emptyShip(), 'thermal_converter', 4, 0);
    const def = moduleTable.get('thermal_converter');
    expect(def.effects.length).toBeGreaterThan(0);
    expect(adjacencyActive(alone, 'thermal_converter')).toBe(false);
  });

  it('reports no neighbours for a module that is not on the grid', () => {
    expect(neighboursOf(emptyShip(), 'core_reactor')).toEqual([]);
  });
});

describe('the module pool', () => {
  it('gives every module a footprint that fits the starting grid', () => {
    for (const def of moduleTable.all()) {
      expect(def.footprint.w, def.id).toBeGreaterThan(0);
      expect(def.footprint.h, def.id).toBeGreaterThan(0);
      expect(def.footprint.w, `${def.id} is wider than the starting grid`).toBeLessThanOrEqual(SHIP.gridW);
      expect(def.footprint.h, `${def.id} is taller than the starting grid`).toBeLessThanOrEqual(SHIP.gridH);
    }
  });

  it('gives every module something to do — except cargo, whose job is to be in the way', () => {
    for (const def of moduleTable.all()) {
      if (def.kind === 'cargo') continue;
      const does = def.effects.length > 0 || def.grants !== undefined;
      expect(does, `${def.id} has no effects and grants no verb`).toBe(true);
    }
  });

  it('keeps cargo inert, so a Thread charges space and nothing else', () => {
    for (const def of moduleTable.all()) {
      if (def.kind !== 'cargo') continue;
      expect(def.effects, `${def.id} does something`).toEqual([]);
      expect(def.grants, `${def.id} grants a verb`).toBeUndefined();
      // Never rolled. The only way onto the grid is to have agreed to carry it.
      expect(def.rarity, `${def.id} can be rolled as a reward`).toBe('basic');
    }
  });

  it('never declares an adjacency bonus without saying what it wants', () => {
    for (const def of moduleTable.all()) {
      if (def.adjacencyEffects === undefined) continue;
      expect(def.adjacentTo?.length ?? 0, `${def.id} has a bonus with no partner`).toBeGreaterThan(0);
    }
  });
});
