/* The ship grid.
 *
 * Modules are shapes, not rectangles, and they turn. Space is the whole
 * constraint — a great module you have no room for is the same decision the old
 * Power budget was reaching for, expressed spatially. See SHIP.md.
 *
 * Everything here works on CELL SETS rather than bounding boxes. That is the
 * change that lets an L nest into the corner another L leaves behind, and it is
 * also why adjacency has to be computed the same way: two shapes touch when any
 * cell of one is orthogonally beside any cell of the other, which a bounding-box
 * test gets wrong the moment either of them has a notch in it.
 *
 * Pure, like everything under `engine/`. Placement returns a reason when it
 * fails, because "installing over budget is rejected with a clear reason" is
 * the point: the player should never be told no without being told why.
 */

import type {
  Cell,
  Footprint,
  ModuleDef,
  ModuleKind,
  PlacedModule,
  Rotation,
  ShipState,
} from '../types.ts';
import { modules as moduleTable } from '../../content/registry.ts';

export type { Cell };

export function footprintOf(moduleId: string): Footprint {
  return moduleTable.get(moduleId).footprint;
}

/* ---------- shapes ---------- */

/** The occupied offsets of a footprint at rotation 0. */
function baseCells(shape: Footprint): readonly Cell[] {
  const cells: Cell[] = [];
  const mask = shape.mask;
  for (let y = 0; y < shape.h; y++) {
    for (let x = 0; x < shape.w; x++) {
      const row = mask?.[y];
      if (mask !== undefined && (row === undefined || row[x] !== '#')) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * The occupied offsets after `rot` quarter turns clockwise, normalised back to
 * the origin so a rotated shape still places from its top-left corner.
 */
export function shapeCells(shape: Footprint, rot: Rotation): readonly Cell[] {
  let cells = baseCells(shape);
  for (let turn = 0; turn < rot; turn++) {
    // (x, y) -> (maxY - y, x). Normalised below, so the constant drops out.
    const maxY = Math.max(...cells.map((cell) => cell.y));
    cells = cells.map((cell) => ({ x: maxY - cell.y, y: cell.x }));
  }
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells
    .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The bounding box a shape needs at this rotation. */
export function sizeOf(moduleId: string, rot: Rotation): { readonly w: number; readonly h: number } {
  const cells = shapeCells(footprintOf(moduleId), rot);
  return {
    w: Math.max(...cells.map((cell) => cell.x)) + 1,
    h: Math.max(...cells.map((cell) => cell.y)) + 1,
  };
}

/** How many distinct orientations this shape actually has. A square has one. */
export function distinctRotations(moduleId: string): readonly Rotation[] {
  const shape = footprintOf(moduleId);
  const seen = new Set<string>();
  const out: Rotation[] = [];
  for (const rot of [0, 1, 2, 3] as const) {
    const key = shapeCells(shape, rot)
      .map((cell) => `${cell.x},${cell.y}`)
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rot);
  }
  return out;
}

/** The next orientation that actually looks different. */
export function nextRotation(moduleId: string, rot: Rotation): Rotation {
  const available = distinctRotations(moduleId);
  const index = available.indexOf(rot);
  return available[(index + 1) % available.length] ?? 0;
}

/** Every cell a placement occupies, in grid coordinates. */
export function cellsOf(placed: PlacedModule): readonly Cell[] {
  return shapeCells(footprintOf(placed.moduleId), placed.rot).map((cell) => ({
    x: placed.x + cell.x,
    y: placed.y + cell.y,
  }));
}

function keyOf(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function overlaps(a: PlacedModule, b: PlacedModule): boolean {
  const taken = new Set(cellsOf(b).map(keyOf));
  return cellsOf(a).some((cell) => taken.has(keyOf(cell)));
}

/* ---------- placement ---------- */

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
  rot: Rotation = 0,
  ignoreId?: string,
): PlacementCheck {
  const def = moduleTable.find(moduleId);
  if (def === undefined) return { ok: false, reason: `No module '${moduleId}'.` };

  const candidate: PlacedModule = { moduleId, x, y, rot };
  const cells = cellsOf(candidate);
  const size = sizeOf(moduleId, rot);

  if (x < 0 || y < 0) return { ok: false, reason: 'Off the grid.' };
  if (cells.some((cell) => cell.x >= ship.gridW || cell.y >= ship.gridH)) {
    return { ok: false, reason: `${def.name} is ${size.w}x${size.h} this way round and does not fit there.` };
  }

  for (const existing of ship.placed) {
    if (existing.moduleId === ignoreId) continue;
    if (overlaps(candidate, existing)) {
      return { ok: false, reason: `Overlaps ${moduleTable.get(existing.moduleId).name}.` };
    }
  }

  return { ok: true, reason: null };
}

/** First free spot and orientation, scanning left to right, top to bottom. */
export function firstFit(
  ship: ShipState,
  moduleId: string,
): { readonly x: number; readonly y: number; readonly rot: Rotation } | null {
  for (const rot of distinctRotations(moduleId)) {
    for (let y = 0; y < ship.gridH; y++) {
      for (let x = 0; x < ship.gridW; x++) {
        if (canPlace(ship, moduleId, x, y, rot).ok) return { x, y, rot };
      }
    }
  }
  return null;
}

/** Drop one matching entry, keeping duplicates. */
function removeOne(list: readonly string[], value: string): readonly string[] {
  const index = list.indexOf(value);
  return index === -1 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
}

export function place(
  ship: ShipState,
  moduleId: string,
  x: number,
  y: number,
  rot: Rotation = 0,
): ShipState {
  if (!canPlace(ship, moduleId, x, y, rot).ok) return ship;
  return {
    ...ship,
    placed: [...ship.placed, { moduleId, x, y, rot }],
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

export function moveModule(
  ship: ShipState,
  moduleId: string,
  x: number,
  y: number,
  rot?: Rotation,
): ShipState {
  const existing = ship.placed.find((entry) => entry.moduleId === moduleId);
  if (existing === undefined) return ship;
  const turned = rot ?? existing.rot;
  if (!canPlace(ship, moduleId, x, y, turned, moduleId).ok) return ship;
  return {
    ...ship,
    placed: ship.placed.map((entry) =>
      entry.moduleId === moduleId ? { ...entry, x, y, rot: turned } : entry,
    ),
  };
}

/**
 * Turn a module where it stands, if the new orientation still fits.
 *
 * Refused rather than nudged: a rotate that quietly slid the module somewhere
 * else would undo the packing the player just did on the rest of the grid.
 */
export function rotateModule(ship: ShipState, moduleId: string): ShipState {
  const existing = ship.placed.find((entry) => entry.moduleId === moduleId);
  if (existing === undefined) return ship;
  const turned = nextRotation(moduleId, existing.rot);
  if (turned === existing.rot) return ship;
  return moveModule(ship, moduleId, existing.x, existing.y, turned);
}

export function usedCells(ship: ShipState): number {
  return ship.placed.reduce((total, entry) => total + cellsOf(entry).length, 0);
}

export function freeCells(ship: ShipState): number {
  return ship.gridW * ship.gridH - usedCells(ship);
}

/* ---------- adjacency ----------
   Touching edges, not corners. Corner-touching reads as "not connected" to
   anyone looking at a grid, and a rule the player has to be told is a rule
   they will get wrong.

   Computed cell-by-cell rather than box-to-box: with real shapes on the grid,
   two bounding boxes can sit beside each other while the actual filled cells
   never meet, and a bonus that pays for a connection you cannot see is worse
   than no bonus. */

function touches(a: PlacedModule, b: PlacedModule): boolean {
  const other = new Set(cellsOf(b).map(keyOf));
  return cellsOf(a).some((cell) =>
    [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 },
    ].some((side) => other.has(keyOf(side))),
  );
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
