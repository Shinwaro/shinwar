/* Map generation.
 *
 * A Slay the Spire style DAG, built bottom-up: six paths start on row 0 and
 * walk to the boss, drifting one column at a time and merging where they meet.
 * The merging is what makes the map a decision surface rather than six
 * corridors — you can see where routes rejoin and price the detour.
 *
 * Everything rolls on the `map` stream, so a seed's map is fixed no matter how
 * many die rolls combat later grows.
 *
 * The guarantees from the build prompt §5 live in `mapProblems` and are
 * asserted across a thousand seeds by the tests. Most of them are satisfied by
 * construction — crucially, the "no two Safe Planets adjacent" and "no repeated
 * encounter" rules are enforced against a node's real PREDECESSORS, not against
 * the same column one row down. An edge can arrive from a neighbouring column,
 * so a same-column check silently misses most of the cases it exists for.
 */

import type { EncounterId, MapNode, NodeType, RngState, RunMap } from '../types.ts';
import { nextInt, weightedPick } from '../rng.ts';
import { MAP, NODE_WEIGHTS } from '../../content/balance.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import { encountersFor } from '../../content/encounters.ts';

export interface GeneratedMap {
  readonly map: RunMap;
  readonly rng: RngState;
}

function nodeId(row: number, col: number): string {
  return `n${row}_${col}`;
}

/* ---------- skeleton ---------- */

interface Skeleton {
  /** `cells[row]` is the sorted set of columns occupied on that row. */
  readonly cells: readonly (readonly number[])[];
  /** `forward[row]` maps a column to the columns it reaches on `row + 1`. */
  readonly forward: readonly Map<number, Set<number>>[];
  /** `back[row]` maps a column to the columns on `row - 1` that reach it. */
  readonly back: readonly Map<number, Set<number>>[];
}

/**
 * Walk `MAP.paths` routes from row 0 to the last row. Each step drifts at most
 * one column, which keeps the drawn map readable — no lines leaping the width
 * of the screen.
 */
function buildSkeleton(rng: RngState, rows: number): { skeleton: Skeleton; rng: RngState } {
  const cells: number[][] = Array.from({ length: rows }, () => []);
  const forward: Map<number, Set<number>>[] = Array.from({ length: rows }, () => new Map());
  const back: Map<number, Set<number>>[] = Array.from({ length: rows }, () => new Map());
  let current = rng;

  const occupy = (row: number, col: number): void => {
    const list = cells[row];
    if (list !== undefined && !list.includes(col)) list.push(col);
  };

  const connect = (row: number, from: number, to: number): void => {
    const out = forward[row];
    const into = back[row + 1];
    if (out !== undefined) out.set(from, (out.get(from) ?? new Set<number>()).add(to));
    if (into !== undefined) into.set(to, (into.get(to) ?? new Set<number>()).add(from));
  };

  const starts = new Set<number>();

  for (let path = 0; path < MAP.paths; path++) {
    const rolled = nextInt(current, 'map', 0, MAP.columns);
    current = rolled.rng;
    let col = rolled.value;

    // The first two paths must start apart, or the map opens as a single point
    // and the first choice is not a choice.
    if (path === 1 && starts.has(col)) col = (col + 1) % MAP.columns;
    starts.add(col);
    occupy(0, col);

    for (let row = 0; row < rows - 1; row++) {
      const drift = nextInt(current, 'map', -1, 2);
      current = drift.rng;
      const next = Math.max(0, Math.min(MAP.columns - 1, col + drift.value));
      occupy(row + 1, next);
      connect(row, col, next);
      col = next;
    }
  }

  // The boss is one node the whole map funnels into.
  const last = rows - 1;
  const bossCol = Math.floor(MAP.columns / 2);
  const penultimate = cells[last - 1] ?? [];
  cells[last] = [bossCol];

  const intoBoss = back[last];
  const outOfPenultimate = forward[last - 1];
  intoBoss?.clear();
  outOfPenultimate?.clear();
  for (const col of penultimate) {
    outOfPenultimate?.set(col, new Set([bossCol]));
    intoBoss?.set(bossCol, (intoBoss.get(bossCol) ?? new Set<number>()).add(col));
  }

  return {
    skeleton: {
      cells: cells.map((row) => [...row].sort((a, b) => a - b)),
      forward,
      back,
    },
    rng: current,
  };
}

/* ---------- node types ---------- */

function predecessorsOf(skeleton: Skeleton, row: number, col: number): readonly number[] {
  if (row === 0) return [];
  return [...(skeleton.back[row]?.get(col) ?? new Set<number>())];
}

function assignTypes(
  skeleton: Skeleton,
  rng: RngState,
  rows: number,
): { types: Map<string, NodeType>; rng: RngState } {
  const types = new Map<string, NodeType>();
  let current = rng;

  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);

      // Fixed rows: the opening, the rest before the boss, the boss itself.
      if (row === rows - 1) {
        types.set(id, 'boss');
        continue;
      }
      if (row === 0) {
        // Act 1 node 1 is always a normal combat, in Clear Space.
        types.set(id, 'combat');
        continue;
      }
      if (MAP.restBeforeBoss && row === rows - 2) {
        types.set(id, 'safe');
        continue;
      }

      const early = row < MAP.earliestSpecialRow;
      // Real predecessors, not the same column one row down.
      const above = predecessorsOf(skeleton, row, col).map((from) => types.get(nodeId(row - 1, from)));
      const afterSafe = above.includes('safe');

      const rolled = weightedPick(current, 'map', [
        { value: 'combat' as NodeType, weight: NODE_WEIGHTS.combat },
        { value: 'unknown' as NodeType, weight: NODE_WEIGHTS.unknown },
        { value: 'event' as NodeType, weight: NODE_WEIGHTS.event },
        // Nothing special in the opening rows: Act 1 should feel plain before
        // it starts offering deals.
        { value: 'elite' as NodeType, weight: early ? 0 : NODE_WEIGHTS.elite },
        { value: 'station' as NodeType, weight: early ? 0 : NODE_WEIGHTS.station },
        // Two Safe Planets in a row on one path wastes the choice they exist for.
        { value: 'safe' as NodeType, weight: early || afterSafe ? 0 : NODE_WEIGHTS.safe },
      ]);

      current = rolled.rng;
      types.set(id, rolled.value);
    }
  }

  return { types, rng: current };
}

/* ---------- encounters ---------- */

function poolFor(act: 1 | 2 | 3, type: NodeType): readonly { id: EncounterId }[] {
  const tier = type === 'elite' ? 'elite' : type === 'boss' ? 'boss' : 'normal';
  const exact = encountersFor(act, tier);
  // Elites and bosses get their own rosters at M5. Until then they fall back to
  // the normal pool so every combat node is playable — under-tuned beats empty.
  return exact.length > 0 ? exact : encountersFor(act, 'normal');
}

function assignEncounters(
  skeleton: Skeleton,
  types: Map<string, NodeType>,
  rng: RngState,
  rows: number,
  act: 1 | 2 | 3,
): { encounters: Map<string, EncounterId>; rng: RngState } {
  const encounters = new Map<string, EncounterId>();
  let current = rng;

  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);
      const type = types.get(id);
      if (type !== 'combat' && type !== 'elite' && type !== 'boss') continue;

      const pool = poolFor(act, type);
      if (pool.length === 0) continue;

      // Never the same encounter twice in a row on any path into this node.
      const used = predecessorsOf(skeleton, row, col)
        .map((from) => encounters.get(nodeId(row - 1, from)))
        .filter((entry): entry is EncounterId => entry !== undefined);

      const usable = pool.filter((entry) => !used.includes(entry.id));
      const candidates = usable.length > 0 ? usable : pool;

      const rolled = weightedPick(
        current,
        'map',
        candidates.map((entry) => ({ value: entry.id, weight: 1 })),
      );
      current = rolled.rng;
      encounters.set(id, rolled.value);
    }
  }

  return { encounters, rng: current };
}

/* ---------- assembly ---------- */

function assemble(skeleton: Skeleton, act: 1 | 2 | 3, rng: RngState): GeneratedMap {
  const rows = skeleton.cells.length;
  const typed = assignTypes(skeleton, rng, rows);
  const fought = assignEncounters(skeleton, typed.types, typed.rng, rows, act);

  const nodes: MapNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);
      const type = typed.types.get(id) ?? 'combat';
      const encounterId = fought.encounters.get(id) ?? null;
      const outgoing = [...(skeleton.forward[row]?.get(col) ?? new Set<number>())].sort((a, b) => a - b);

      nodes.push({
        id,
        row,
        col,
        type,
        // Everything is on foot until ship combat exists. The vocabulary is in
        // place so the map, routing and the crash are built once — see SHIP.md.
        arena: 'surface',
        encounterId,
        // Real environments arrive at M5. Act 1 node 1 is always Clear Space,
        // which is trivially true while it is the only one.
        environmentId: encounterId === null ? null : CLEAR_SPACE_ID,
        next: outgoing.map((target) => nodeId(row + 1, target)),
      });
    }
  }

  const bossRow = rows - 1;
  const boss = nodes.find((node) => node.row === bossRow);

  return {
    map: {
      act,
      nodes,
      entries: nodes.filter((node) => node.row === 0).map((node) => node.id),
      bossId: boss?.id ?? nodeId(bossRow, 0),
    },
    rng: fought.rng,
  };
}

/* ---------- invariants ----------
   The guarantees from the build prompt §5, checked as data rather than
   trusted. Generation retries if any of them fail, but they are satisfied by
   construction — a retry here means the weights and the guarantees have
   drifted apart, and the thrown message says so. */

export function mapProblems(map: RunMap): string[] {
  const problems: string[] = [];
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const rows = Math.max(...map.nodes.map((node) => node.row)) + 1;

  for (const entry of map.entries) {
    const seen = new Set<string>();
    const stack = [entry];
    let reached = false;
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      if (id === map.bossId) {
        reached = true;
        break;
      }
      for (const next of byId.get(id)?.next ?? []) stack.push(next);
    }
    if (!reached) problems.push(`entry ${entry} cannot reach the boss`);
  }

  const countOf = (type: NodeType): number => map.nodes.filter((node) => node.type === type).length;
  if (countOf('safe') < 2) problems.push(`only ${countOf('safe')} Safe Planets`);
  if (countOf('elite') < 2) problems.push(`only ${countOf('elite')} Elites`);

  const backHalf = map.nodes.filter((node) => node.row >= Math.floor(rows / 2));
  if (!backHalf.some((node) => node.type === 'station')) {
    problems.push('no Station in the back half');
  }

  for (const node of map.nodes) {
    for (const nextId of node.next) {
      const next = byId.get(nextId);
      if (next === undefined) {
        problems.push(`${node.id} points at missing ${nextId}`);
        continue;
      }
      if (node.type === 'safe' && next.type === 'safe') {
        problems.push(`Safe Planets adjacent: ${node.id} -> ${nextId}`);
      }
      if (node.encounterId !== null && node.encounterId === next.encounterId) {
        problems.push(`repeat encounter ${node.encounterId}: ${node.id} -> ${nextId}`);
      }
    }
  }

  for (const entry of map.entries) {
    const node = byId.get(entry);
    if (node?.type !== 'combat') {
      problems.push(`entry ${entry} is ${node?.type ?? 'missing'}, not combat`);
    }
    if (node?.environmentId !== CLEAR_SPACE_ID) {
      problems.push(`entry ${entry} is not Clear Space`);
    }
  }

  return problems;
}

/* ---------- entry point ---------- */

const MAX_ATTEMPTS = 40;

export function generateMap(rng: RngState, act: 1 | 2 | 3): GeneratedMap {
  const rows = MAP.rows[act];
  let current = rng;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildSkeleton(current, rows);
    const assembled = assemble(built.skeleton, act, built.rng);
    current = assembled.rng;
    if (mapProblems(assembled.map).length === 0) return assembled;
  }

  throw new Error(
    `mapgen: could not satisfy the invariants for act ${act} in ${MAX_ATTEMPTS} attempts. ` +
      `The weights in balance.ts and the guarantees in mapProblems have drifted apart.`,
  );
}
