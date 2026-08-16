/* The ship grid.
 *
 * Modules are rectangles. Space is the whole constraint — a great module you
 * have no room for is the same decision the old Power budget was reaching for,
 * expressed spatially. See SHIP.md.
 *
 * Pure, like everything under `engine/`. Placement returns a reason when it
 * fails, because "installing over budget is rejected with a clear reason" is
 * the point: the player should never be told no without being told why.
 */

import type { Footprint, ModuleDef, ModuleKind, PlacedModule, ShipState } from '../types.ts';
import { modules as moduleTable } from '../../content/registry.ts';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export function footprintOf(moduleId: string): Footprint {
  return moduleTable.get(moduleId).footprint;
}

/** Every cell a placement would occupy. */
export function cellsOf(placed: PlacedModule): readonly Cell[] {
  const size = footprintOf(placed.moduleId);
  const cells: Cell[] = [];
  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) cells.push({ x: placed.x + dx, y: placed.y + dy });
  }
  return cells;
}

function overlaps(a: PlacedModule, b: PlacedModule): boolean {
  const sa = footprintOf(a.moduleId);
  const sb = footprintOf(b.moduleId);
  return a.x < b.x + sb.w && a.x + sa.w > b.x && a.y < b.y + sb.h && a.y + sa.h > b.y;
}

export interface PlacementCheck {
  readonly ok: boolean;
  /** Words the UI can show without inventing its own. */
  readonly reason: string | null;
}

/**
 * May this module sit here? `ignoreId` lets a module be dragged without
 * colliding with the space it currently occupies.
 */
export function canPlace(
  ship: ShipState,
  moduleId: string,
  x: number,
  y: number,
  ignoreId?: string,
): PlacementCheck {
  const def = moduleTable.find(moduleId);
  if (def === undefined) return { ok: false, reason: `No module '${moduleId}'.` };

  const size = def.footprint;
  if (x < 0 || y < 0) return { ok: false, reason: 'Off the grid.' };
  if (x + size.w > ship.gridW || y + size.h > ship.gridH) {
    return { ok: false, reason: `${def.name} is ${size.w}x${size.h} and does not fit there.` };
  }

  const candidate: PlacedModule = { moduleId, x, y };
  for (const existing of ship.placed) {
    if (existing.moduleId === ignoreId) continue;
    if (overlaps(candidate, existing)) {
      return { ok: false, reason: `Overlaps ${moduleTable.get(existing.moduleId).name}.` };
    }
  }

  return { ok: true, reason: null };
}

/** First free spot, scanning left to right, top to bottom. `null` if it will not fit. */
export function firstFit(ship: ShipState, moduleId: string): Cell | null {
  for (let y = 0; y < ship.gridH; y++) {
    for (let x = 0; x < ship.gridW; x++) {
      if (canPlace(ship, moduleId, x, y).ok) return { x, y };
    }
  }
  return null;
}

/** Drop one matching entry, keeping duplicates. */
function removeOne(list: readonly string[], value: string): readonly string[] {
  const index = list.indexOf(value);
  return index === -1 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
}

export function place(ship: ShipState, moduleId: string, x: number, y: number): ShipState {
  if (!canPlace(ship, moduleId, x, y).ok) return ship;
  return {
    ...ship,
    placed: [...ship.placed, { moduleId, x, y }],
    stored: removeOne(ship.stored, moduleId),
  };
}

/** Take a module off the grid and back into storage. Always free. */
export function unplace(ship: ShipState, moduleId: string): ShipState {
  if (!ship.placed.some((entry) => entry.moduleId === moduleId)) return ship;
  return {
    ...ship,
    placed: ship.placed.filter((entry) => entry.moduleId !== moduleId),
    stored: [...ship.stored, moduleId],
  };
}

export function moveModule(ship: ShipState, moduleId: string, x: number, y: number): ShipState {
  if (!canPlace(ship, moduleId, x, y, moduleId).ok) return ship;
  return {
    ...ship,
    placed: ship.placed.map((entry) => (entry.moduleId === moduleId ? { ...entry, x, y } : entry)),
  };
}

export function usedCells(ship: ShipState): number {
  return ship.placed.reduce((total, entry) => {
    const size = footprintOf(entry.moduleId);
    return total + size.w * size.h;
  }, 0);
}

export function freeCells(ship: ShipState): number {
  return ship.gridW * ship.gridH - usedCells(ship);
}

/* ---------- adjacency ----------
   Touching edges, not corners. Corner-touching reads as "not connected" to
   anyone looking at a grid, and a rule the player has to be told is a rule
   they will get wrong. */

function touches(a: PlacedModule, b: PlacedModule): boolean {
  const sa = footprintOf(a.moduleId);
  const sb = footprintOf(b.moduleId);
  const horizontallyClose = a.x + sa.w === b.x || b.x + sb.w === a.x;
  const verticallyClose = a.y + sa.h === b.y || b.y + sb.h === a.y;
  const rowsOverlap = a.y < b.y + sb.h && a.y + sa.h > b.y;
  const colsOverlap = a.x < b.x + sb.w && a.x + sa.w > b.x;
  return (horizontallyClose && rowsOverlap) || (verticallyClose && colsOverlap);
}

export function neighboursOf(ship: ShipState, moduleId: string): readonly ModuleDef[] {
  const self = ship.placed.find((entry) => entry.moduleId === moduleId);
  if (self === undefined) return [];
  return ship.placed
    .filter((entry) => entry.moduleId !== moduleId && touches(self, entry))
    .map((entry) => moduleTable.get(entry.moduleId));
}

/** Is this module's adjacency bonus live? */
export function adjacencyActive(ship: ShipState, moduleId: string): boolean {
  const def = moduleTable.find(moduleId);
  const wanted = def?.adjacentTo;
  if (def === undefined || wanted === undefined || wanted.length === 0) return false;
  const kinds = new Set<ModuleKind>(neighboursOf(ship, moduleId).map((entry) => entry.kind));
  return wanted.some((kind) => kinds.has(kind));
}
