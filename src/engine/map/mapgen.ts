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

import type {
  EncounterId,
  EnvironmentId,
  MapNode,
  NodeType,
  RngState,
  RunMap,
} from '../types.ts';
import { nextInt, pick, weightedPick } from '../rng.ts';
import { MAP, NODE_WEIGHTS } from '../../content/balance.ts';
import { ACT_FINALES, ARRIVAL_NAME, PLACE_DESIGNATIONS, PLACE_STEMS } from '../../content/places.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import { environments as environmentTable } from '../../content/registry.ts';
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

  /* The origin: always one node, always the middle. You arrive where you
     arrive; the decision is which lane out of it you take. */
  const originCol = Math.floor(MAP.columns / 2);
  occupy(0, originCol);

  /* The fan. Three to six distinct lanes, spread across the width rather than
     bunched, so the opening choice reads as a real spread of directions. */
  const rolledBranches = nextInt(current, 'map', MAP.branches.min, MAP.branches.max + 1);
  current = rolledBranches.rng;
  const branchCount = Math.min(rolledBranches.value, MAP.columns);

  const branchCols: number[] = [];
  for (let i = 0; i < branchCount; i++) {
    const slot = Math.round((i * (MAP.columns - 1)) / Math.max(1, branchCount - 1));
    const jitter = nextInt(current, 'map', 0, 2);
    current = jitter.rng;
    // Nudge the inner lanes so the fan is not perfectly symmetrical.
    const nudged = i === 0 || i === branchCount - 1 ? slot : slot + (jitter.value === 0 ? 0 : 1);
    const col = Math.max(0, Math.min(MAP.columns - 1, nudged));
    if (!branchCols.includes(col)) branchCols.push(col);
  }
  // A collision on the nudge must not silently shrink the fan below the floor.
  for (let col = 0; col < MAP.columns && branchCols.length < MAP.branches.min; col++) {
    if (!branchCols.includes(col)) branchCols.push(col);
  }
  branchCols.sort((a, b) => a - b);

  for (const col of branchCols) {
    occupy(1, col);
    connect(0, originCol, col);
  }

  /* Path walks from row 1 upward, one per lane and then round-robin so the
     map keeps its density even when the fan is narrow. */
  const walks = Math.max(MAP.paths, branchCols.length);
  for (let path = 0; path < walks; path++) {
    let col = branchCols[path % branchCols.length] ?? originCol;

    for (let row = 1; row < rows - 1; row++) {
      const drift = nextInt(current, 'map', -1, 2);
      current = drift.rng;
      const next = Math.max(0, Math.min(MAP.columns - 1, col + drift.value));
      occupy(row + 1, next);
      connect(row, col, next);
      col = next;
    }
  }

  /* Weave. The walks alone only branch where two of them diverge, which left
     the map reading as a few parallel lines you picked between once. This adds
     sideways links between what is already there, so a row is a decision rather
     than a lane — capped, because a star with five lanes out of it is noise. */
  for (let row = 1; row < rows - 2; row++) {
    const out = forward[row];
    const here = cells[row] ?? [];
    for (const col of here) {
      const targets = out?.get(col);
      if (targets === undefined) continue;
      for (const drift of [-1, 1]) {
        if (targets.size >= MAP.maxBranchesPerNode) break;
        const candidate = col + drift;
        if (!(cells[row + 1] ?? []).includes(candidate)) continue;
        if (targets.has(candidate)) continue;
        const roll = nextInt(current, 'map', 0, 100);
        current = roll.rng;
        if (roll.value >= MAP.weaveChance * 100) continue;
        connect(row, col, candidate);
      }
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
  // Clamped clear of the opening rows, the rest-before-boss and the boss.
  const stationRow = Math.min(
    rows - 3,
    Math.max(MAP.earliestSpecialRow, Math.round((rows - 1) * MAP.stationRowAt)),
  );

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
      // The guaranteed Station row. See MAP.stationRowAt.
      if (row === stationRow) {
        types.set(id, 'station');
        continue;
      }

      const early = row < MAP.earliestSpecialRow;

      /*
       * Look back along real edges, not up the column.
       *
       * `MAP.safeSpacing` rows of it: two Safe Planets close together on one
       * path waste the choice they exist for, because you arrive at the second
       * still full from the first. One row of separation was not enough — a
       * rest two nodes apart is the same problem with a step in between.
       */
      const nearby = typesWithin(skeleton, types, row, col, MAP.safeSpacing);
      /*
       * Looking back catches a rest that follows a rest. It cannot catch one
       * that sits just *before* the guaranteed rest-before-boss row, because
       * that row is placed unconditionally rather than rolled — so the window
       * in front of it is closed here by hand.
       */
      const beforeBossRest = MAP.restBeforeBoss && row >= rows - 2 - MAP.safeSpacing;
      const afterSafe = nearby.includes('safe') || beforeBossRest;

      const rolled = weightedPick(current, 'map', [
        { value: 'combat' as NodeType, weight: NODE_WEIGHTS.combat },
        { value: 'unknown' as NodeType, weight: NODE_WEIGHTS.unknown },
        { value: 'event' as NodeType, weight: NODE_WEIGHTS.event },
        // Nothing special in the opening rows: Act 1 should feel plain before
        // it starts offering deals.
        { value: 'elite' as NodeType, weight: early ? 0 : NODE_WEIGHTS.elite },
        { value: 'station' as NodeType, weight: early ? 0 : NODE_WEIGHTS.station },
        // Kept apart by `safeSpacing`; see `typesWithin` above.
        { value: 'safe' as NodeType, weight: early || afterSafe ? 0 : NODE_WEIGHTS.safe },
      ]);

      current = rolled.rng;
      types.set(id, rolled.value);
    }
  }

  return { types, rng: current };
}

/**
 * Every node type within `depth` rows behind this one, along real edges.
 *
 * Used to keep node kinds apart on a *path* rather than on the chart: two Safe
 * Planets can sit side by side in the same row quite happily, because no single
 * route takes both. What matters is what you meet in sequence.
 */
function typesWithin(
  skeleton: Skeleton,
  types: Map<string, NodeType>,
  row: number,
  col: number,
  depth: number,
): readonly (NodeType | undefined)[] {
  const seen: (NodeType | undefined)[] = [];
  let frontier: readonly number[] = [col];

  for (let back = 1; back <= depth; back++) {
    const previousRow = row - back;
    if (previousRow < 0) break;
    const next: number[] = [];
    for (const at of frontier) {
      for (const from of predecessorsOf(skeleton, previousRow + 1, at)) {
        seen.push(types.get(nodeId(previousRow, from)));
        if (!next.includes(from)) next.push(from);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return seen;
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

/* ---------- environments ----------
   The second layer of the route decision. Every combat node carries one and
   shows it before the player commits, so two players looking at the same fork
   should genuinely disagree about which way to go.

   Clear Space stays common in Act 1 and thins out after: the opening act is
   where the stance layer is still being learned, and a modifier on every fight
   would bury it. */

function environmentPool(act: 1 | 2 | 3): readonly { value: EnvironmentId; weight: number }[] {
  return environmentTable
    .all()
    .filter((def) => def.acts === undefined || def.acts.includes(act))
    .map((def) => ({
      value: def.id,
      weight: def.id === CLEAR_SPACE_ID ? (act === 1 ? 46 : 16) : act === 1 ? 11 : 14,
    }));
}

function assignEnvironments(
  skeleton: Skeleton,
  encounters: Map<string, EncounterId>,
  rng: RngState,
  rows: number,
  act: 1 | 2 | 3,
): { environments: Map<string, EnvironmentId>; rng: RngState } {
  const assigned = new Map<string, EnvironmentId>();
  const pool = environmentPool(act);
  let current = rng;

  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);
      if (!encounters.has(id)) continue;

      // Act 1 node 1 is always a normal combat in Clear Space, asserted below.
      if (row === 0 && act === 1) {
        assigned.set(id, CLEAR_SPACE_ID);
        continue;
      }
      const rolled = weightedPick(current, 'map', pool);
      current = rolled.rng;
      assigned.set(id, rolled.value);
    }
  }

  return { environments: assigned, rng: current };
}

/* ---------- names ----------
   Rolled with the rest of the map so a seed draws the same sky with the same
   places on it. Never repeated inside an act: two "Kessel Deep"s on one chart
   would undo the only thing the names are for. */

function assignNames(
  skeleton: Skeleton,
  rng: RngState,
  rows: number,
  act: 1 | 2 | 3,
): { names: Map<string, string>; rng: RngState } {
  const names = new Map<string, string>();
  const used = new Set<string>();
  let current = rng;

  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);

      // The two landmarks are fixed. Where you come in and what waits at the
      // end should be the same words every run.
      if (row === 0) {
        names.set(id, ARRIVAL_NAME);
        continue;
      }
      if (row === rows - 1) {
        names.set(id, ACT_FINALES[act]);
        continue;
      }

      let picked: string | null = null;
      // Bounded: after enough tries take whatever came up rather than looping
      // on a full pool, which on a very wide act is a real possibility.
      for (let attempt = 0; attempt < 12 && picked === null; attempt++) {
        const stem = pick(current, 'map', PLACE_STEMS);
        current = stem.rng;
        const designation = pick(current, 'map', PLACE_DESIGNATIONS);
        current = designation.rng;
        const candidate = `${stem.value} ${designation.value}`;
        if (!used.has(candidate)) picked = candidate;
      }
      const name = picked ?? `Sector ${row}-${col}`;
      used.add(name);
      names.set(id, name);
    }
  }

  return { names, rng: current };
}

/* ---------- assembly ---------- */

/**
 * Where a node sits on the chart. Rows drive `y`, columns drive `x`, and both
 * get a small deterministic jitter so the result reads as a star chart rather
 * than a spreadsheet. The jitter is small on purpose: enough to break the grid,
 * not enough to make a lane cross its neighbour and lie about who connects to
 * whom.
 */
function positionOf(
  rng: RngState,
  row: number,
  col: number,
  rows: number,
  isOrigin: boolean,
  isBoss: boolean,
): { x: number; y: number; rng: RngState } {
  const laneY = 0.955 - (row / Math.max(1, rows - 1)) * 0.91;
  const laneX = 0.09 + (col / Math.max(1, MAP.columns - 1)) * 0.82;

  // The origin and the boss are landmarks: dead centre, no jitter.
  if (isOrigin || isBoss) return { x: 0.5, y: laneY, rng };

  const jx = nextInt(rng, 'map', -26, 27);
  const jy = nextInt(jx.rng, 'map', -13, 14);
  return {
    x: Math.max(0.05, Math.min(0.95, laneX + jx.value / 1000)),
    y: Math.max(0.03, Math.min(0.97, laneY + jy.value / 1000)),
    rng: jy.rng,
  };
}

function assemble(skeleton: Skeleton, act: 1 | 2 | 3, rng: RngState): GeneratedMap {
  const rows = skeleton.cells.length;
  const typed = assignTypes(skeleton, rng, rows);
  const fought = assignEncounters(skeleton, typed.types, typed.rng, rows, act);
  const scened = assignEnvironments(
    skeleton,
    fought.encounters,
    fought.rng,
    rows,
    act,
  );
  const named = assignNames(skeleton, scened.rng, rows, act);
  let current = named.rng;

  const nodes: MapNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);
      const type = typed.types.get(id) ?? 'combat';
      const encounterId = fought.encounters.get(id) ?? null;
      const outgoing = [...(skeleton.forward[row]?.get(col) ?? new Set<number>())].sort((a, b) => a - b);

      const placed = positionOf(current, row, col, rows, row === 0, row === rows - 1);
      current = placed.rng;

      nodes.push({
        id,
        name: named.names.get(id) ?? id,
        row,
        col,
        x: placed.x,
        y: placed.y,
        type,
        // Everything is on foot until ship combat exists. The vocabulary is in
        // place so the map, routing and the crash are built once — see SHIP.md.
        encounterId,
        environmentId: encounterId === null ? null : (scened.environments.get(id) ?? CLEAR_SPACE_ID),
        next: outgoing.map((target) => nodeId(row + 1, target)),
      });
    }
  }

  const bossRow = rows - 1;
  const boss = nodes.find((node) => node.row === bossRow);
  const origin = nodes.find((node) => node.row === 0);

  return {
    map: {
      act,
      nodes,
      startId: origin?.id ?? nodeId(0, Math.floor(MAP.columns / 2)),
      bossId: boss?.id ?? nodeId(bossRow, 0),
    },
    rng: current,
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

  // Exactly one origin, and a real fan out of it.
  const origins = map.nodes.filter((node) => node.row === 0);
  if (origins.length !== 1) problems.push(`${origins.length} origin nodes, expected 1`);
  const origin = byId.get(map.startId);
  if (origin === undefined) problems.push('startId names no node');
  else if (origin.next.length < MAP.branches.min || origin.next.length > MAP.branches.max) {
    problems.push(`origin fans out into ${origin.next.length} lanes, expected ${MAP.branches.min}-${MAP.branches.max}`);
  }

  // Every node has to be reachable from the origin, and the origin has to
  // reach the boss. An orphan node is a node the player can see and never
  // visit, which reads as a bug even when it is only decoration.
  const reachable = new Set<string>();
  const stack = [map.startId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const next of byId.get(id)?.next ?? []) stack.push(next);
  }
  if (!reachable.has(map.bossId)) problems.push('the origin cannot reach the boss');
  for (const node of map.nodes) {
    if (!reachable.has(node.id)) problems.push(`${node.id} is unreachable from the origin`);
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

  // Act 1 node 1 is always a normal combat, in Clear Space. Later acts still
  // open on a fight — you arrive somewhere and something is already there — but
  // by then an environment on it is information, not noise.
  const first = byId.get(map.startId);
  if (first?.type !== 'combat') {
    problems.push(`the origin is ${first?.type ?? 'missing'}, not combat`);
  }
  if (map.act === 1 && first?.environmentId !== CLEAR_SPACE_ID) {
    problems.push('the origin is not Clear Space');
  }

  // Every fight carries a badge, or the route decision is missing half its
  // information at exactly the fork it was supposed to inform.
  for (const node of map.nodes) {
    if (node.encounterId !== null && node.environmentId === null) {
      problems.push(`${node.id} is a fight with no environment`);
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
