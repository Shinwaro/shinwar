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
import { RELIQUARY_EVENT_ID } from '../../content/events/reliquary.ts';
import { MAP, NODE_ACT_SCALE, NODE_WEIGHTS } from '../../content/balance.ts';
import { ACT_FINALES, ARRIVAL_NAME, PLACE_DESIGNATIONS, PLACE_STEMS } from '../../content/places.ts';
import { CLEAR_SPACE_ID, RADIATION_BELT_ID } from '../../content/environments.ts';
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
  act: 1 | 2 | 3,
): { types: Map<string, NodeType>; rng: RngState } {
  const types = new Map<string, NodeType>();
  let current = rng;
  /* The Reliquary is a full row, clamped clear of the opening, the rest before
     the boss, and the boss itself. It is the only remaining full row besides
     those: "the exact middle of the run" is the whole of its definition, and
     the one legendary card an act can hold is a fixed beat rather than
     something to be unlucky about. */
  const reliquaryRow = act === 2 ? reliquaryRowFor(rows) : -1;

  /* Stations are rolled node by node inside a band of rows — see
     `MAP.stationRows`. The guaranteed full ROW of them is gone, and the
     guarantee is now stated as two invariants on the finished chart. */
  const stationBand = stationRowsFor(rows);

  /* Except in Act 3, where one full row comes back, two before the boss. The
     finale is the fight you cannot walk into underprepared, and it is also the
     furthest from anywhere to spend. See `MAP.stationBeforeAct3Boss`. */
  const stationRow = act === 3 && MAP.stationBeforeAct3Boss ? rows - 3 : -1;

  // How much an Elite and a Station are worth this act. See `NODE_ACT_SCALE`.
  const scale = NODE_ACT_SCALE[act];

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
      /* Act 3's Station row. Before the rest rather than after it, so the order
         is spend, then recover, then fight — a repair you buy and then walk
         past a Safe Planet to reach the boss reads backwards. */
      if (row === stationRow) {
        types.set(id, 'station');
        continue;
      }
      /* The Reliquary row, in Act 2 only. A full row, so no route can miss it.
         It reads as an Anomaly on the chart because that is what it is — the
         node pins which one in `assemble`. Checked BEFORE the Station, because
         the two rows collide in Act 2 and this one is not allowed to move. */
      if (row === reliquaryRow) {
        types.set(id, 'event');
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
      /* Stations keep their distance for the same reason Safe Planets do: the
         second shop on a path is nearly worthless because you spent at the
         first. Its own window, because the two spacings are separate numbers.

         The blind spot that used to sit in front of the guaranteed Station row
         is gone with the row itself — there is nothing placed unconditionally
         left to look forward at. */
      const nearbyStations = typesWithin(skeleton, types, row, col, MAP.stationSpacing);
      /* Looking back catches a shop that follows a shop. It cannot catch one
         that sits just BEFORE Act 3's planted row, because that row is placed
         unconditionally rather than rolled — so the window in front of it is
         closed here by hand, exactly as it is for the rest before the boss. */
      const beforeStationRow = stationRow >= 0 && row >= stationRow - MAP.stationSpacing;
      const afterStation = nearbyStations.includes('station') || beforeStationRow;
      const inStationBand = row >= stationBand.from && row <= stationBand.to;
      /*
       * Looking back catches a rest that follows a rest. It cannot catch one
       * that sits just *before* the guaranteed rest-before-boss row, because
       * that row is placed unconditionally rather than rolled — so the window
       * in front of it is closed here by hand.
       */
      const beforeBossRest = MAP.restBeforeBoss && row >= rows - 2 - MAP.safeSpacing;
      const afterSafe = nearby.includes('safe') || beforeBossRest;

      /*
       * Never two blank-looking nodes in a row on one path.
       *
       * `event` and `unknown` are the two that show no encounter on the chart,
       * and back to back they read as a stretch of map where nothing is
       * happening — you walk two nodes and have fought nothing. Roughly two in
       * five of their exits used to lead into another one. Looking back exactly
       * one row is enough: it is consecutive pairs that read as empty, not a
       * high overall share of them.
       */
      const justBehind = typesWithin(skeleton, types, row, col, 1);
      const afterBlank = justBehind.includes('event') || justBehind.includes('unknown');

      const rolled = weightedPick(current, 'map', [
        { value: 'combat' as NodeType, weight: NODE_WEIGHTS.combat },
        { value: 'unknown' as NodeType, weight: afterBlank ? 0 : NODE_WEIGHTS.unknown },
        { value: 'event' as NodeType, weight: afterBlank ? 0 : NODE_WEIGHTS.event },
        // Nothing special in the opening rows: Act 1 should feel plain before
        // it starts offering deals.
        { value: 'elite' as NodeType, weight: early ? 0 : NODE_WEIGHTS.elite * scale.elite },
        {
          value: 'station' as NodeType,
          weight: !inStationBand || afterStation ? 0 : NODE_WEIGHTS.station * scale.station,
        },
        // Kept apart by `safeSpacing`; see `typesWithin` above.
        { value: 'safe' as NodeType, weight: early || afterSafe ? 0 : NODE_WEIGHTS.safe },
      ]);

      current = rolled.rng;
      types.set(id, rolled.value);
    }
  }

  return plantStationIfMissed(skeleton, types, current, rows, reliquaryRow);
}

/**
 * The half of the Station guarantee that cannot be left to the roll.
 *
 * "You can always route for a shop" has to be true of every chart, and a
 * weighted roll will occasionally produce one where every Station sits off the
 * origin's reachable set — rare, but a run that cannot buy anything for a whole
 * act is not a rare bit of texture, it is a broken act.
 *
 * The other half — "you are never made to visit one" — is NOT repaired here.
 * Removing a Station to satisfy it would fight this pass, so it is a validation
 * failure instead and the chart is regenerated. See `mapProblems`.
 */
function plantStationIfMissed(
  skeleton: Skeleton,
  types: Map<string, NodeType>,
  rng: RngState,
  rows: number,
  reliquaryRow: number,
): { types: Map<string, NodeType>; rng: RngState } {
  const reachable = reachableFrom(skeleton, rows);
  if ([...reachable].some((id) => types.get(id) === 'station')) return { types, rng };

  /* Anything the origin can reach, inside the band, that is not load-bearing
     somewhere else: a Safe Planet is counted by its own invariant, an Elite is
     counted by its own, and the Reliquary row is fixed. That leaves the fights
     and the blank-looking nodes, which is the right pool anyway — a shop should
     replace an ordinary stop, not one of the act's landmarks. */
  const band = stationRowsFor(rows);
  const candidates: string[] = [];
  for (let row = band.from; row <= band.to; row++) {
    if (row === reliquaryRow) continue;
    for (const col of skeleton.cells[row] ?? []) {
      const id = nodeId(row, col);
      if (!reachable.has(id)) continue;
      const type = types.get(id);
      if (type === 'combat' || type === 'unknown' || type === 'event') candidates.push(id);
    }
  }
  if (candidates.length === 0) return { types, rng };

  const picked = nextInt(rng, 'map', 0, candidates.length);
  const next = new Map(types);
  next.set(candidates[picked.value] ?? candidates[0]!, 'station');
  return { types: next, rng: picked.rng };
}

/** Every node the origin can walk to, along real edges. */
function reachableFrom(skeleton: Skeleton, rows: number): ReadonlySet<string> {
  const seen = new Set<string>();
  const stack = (skeleton.cells[0] ?? []).map((col) => nodeId(0, col));
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const [row, col] = id.slice(1).split('_').map(Number) as [number, number];
    if (row + 1 >= rows) continue;
    for (const next of skeleton.forward[row]?.get(col) ?? []) stack.push(nodeId(row + 1, next));
  }
  return seen;
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

function poolFor(act: 1 | 2 | 3, type: NodeType, row: number): readonly { id: EncounterId }[] {
  const tier = type === 'elite' ? 'elite' : type === 'boss' ? 'boss' : 'normal';
  // `row` gates the encounters that declare a `minRow` — the three-wide Act 1
  // packs, which are a different game on the arrival node.
  const exact = encountersFor(act, tier, row);
  // Elites and bosses get their own rosters at M5. Until then they fall back to
  // the normal pool so every combat node is playable — under-tuned beats empty.
  return exact.length > 0 ? exact : encountersFor(act, 'normal', row);
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
      /* Unknowns are given one too, and never show it. A `?` that resolves
         into an ambush used to reach for `fallbackEncounter`, which returns
         the first encounter anywhere on the chart — including an elite or the
         boss. Rolling it here makes the ambush a normal Act-appropriate fight
         and part of the seed like everything else. */
      const rolls = type === 'combat' || type === 'elite' || type === 'boss' || type === 'unknown';
      if (!rolls) continue;

      const pool = poolFor(act, type === 'unknown' ? 'combat' : type, row);
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

      /* The boss fights in a FIXED environment — never a rolled one.
       *
       * An environment is a rule that applies to both sides, and a boss is
       * already the act's whole argument about your deck. Rolling the two
       * together meant the hardest fight in the act was also the one most
       * likely to be decided by something the player never saw and never
       * chose — a Radiation Belt boss and a Clear Space boss are not the same
       * fight.
       *
       * Fixed, it is still the constant the act is measured against: two runs
       * that reach the same boss reach the same fight, which is what makes "I
       * lost to it" mean something.
       *
       * Acts 1 and 2 fix it to Clear Space. Act 3 fixes it to the Radiation
       * Belt, and that is the point rather than an exception: the last fight is
       * the one that has to be unwinnable by grinding, and the Belt is the only
       * rule in the game that charges both sides for time passing. The boss's
       * own escalation says "you cannot afford to take all day"; the Belt makes
       * it true on a clock that runs whether or not anybody acts. It is on the
       * node before you commit to it, like every other environment.
       *
       * The roll is skipped rather than made and discarded — there is nothing
       * for the stream to stay in step with here, since a fixed assignment is
       * not a choice. */
      if (row === rows - 1) {
        assigned.set(id, act === 3 ? RADIATION_BELT_ID : CLEAR_SPACE_ID);
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

/**
 * The rows Stations are allowed on, kept in one place so the generator, the
 * repair pass and the validator cannot disagree about which rows they are.
 *
 * `MAP.stationRows` is written in node numbers into the act; the top is clamped
 * so a short act keeps its shops clear of the rest before the boss and the boss
 * itself.
 */
export function stationRowsFor(rows: number): { readonly from: number; readonly to: number } {
  return {
    from: Math.max(MAP.earliestSpecialRow, MAP.stationRows.from),
    to: Math.min(rows - 3, MAP.stationRows.to),
  };
}

/**
 * The Reliquary's row, kept in one place so the generator and anything that
 * wants to check the invariant agree. Clamped clear of the boss and the rest
 * before it.
 */
export function reliquaryRowFor(rows: number): number {
  return Math.min(rows - 3, Math.max(MAP.earliestSpecialRow, Math.round((rows - 1) * MAP.reliquaryRowAt)));
}

function assemble(skeleton: Skeleton, act: 1 | 2 | 3, rng: RngState): GeneratedMap {
  const rows = skeleton.cells.length;
  const typed = assignTypes(skeleton, rng, rows, act);
  const reliquaryRow = act === 2 ? reliquaryRowFor(rows) : -1;
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
        eventId: row === reliquaryRow && type === 'event' ? RELIQUARY_EVENT_ID : null,
        /* An Unknown that resolves into a fight now fights somewhere, rather
           than always in Clear Space. It is generated here like every other
           node's, so it is part of the seed — the map simply does not draw it,
           which is the whole point of an Unknown. */
        environmentId:
          encounterId === null && type !== 'unknown'
            ? null
            : (scened.environments.get(id) ?? CLEAR_SPACE_ID),
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

  /* ---- the Station guarantee, as two invariants ----
   *
   * These replace the full row of Stations that used to sit across the middle
   * of every act. That row did guarantee a shop, and it guaranteed it by taking
   * the decision away: measured across 600 acts, every route in every one of
   * them was forced through it. Stated as reachability instead, the guarantee
   * says the thing it was always meant to say — a shop is always available to
   * anyone who wants to route for one, and never imposed on anyone who does
   * not. Both are asserted here because both are properties of the finished
   * graph, and neither can be read off a single node. */
  const band = stationRowsFor(rows);
  for (const node of map.nodes) {
    if (node.type !== 'station') continue;
    if (node.row < band.from || node.row > band.to) {
      problems.push(`Station outside rows ${band.from}-${band.to}: ${node.id} on ${node.row}`);
    }
  }

  const memo = new Map<string, boolean>();
  const walk = (id: string, want: (node: MapNode) => boolean | null): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    memo.set(id, false); // cycles cannot happen in a row DAG, but do not trust it
    const node = byId.get(id);
    if (node === undefined) return false;
    const here = want(node);
    const value = here ?? node.next.some((next) => walk(next, want));
    memo.set(id, value);
    return value;
  };

  // Can route for one: some path from the origin meets a Station.
  memo.clear();
  if (!walk(map.startId, (node) => (node.type === 'station' ? true : null))) {
    problems.push('no route from the origin reaches a Station');
  }

  /* Never forced: some path from the origin reaches the boss without one.
   *
   * Acts 1 and 2 only, and the exception is the point rather than a let-off.
   * Act 3 plants a full row of Stations two before the boss — see
   * `MAP.stationBeforeAct3Boss` — so every route is forced through one, on
   * purpose: the finale is the fight a run cannot walk into underprepared, and
   * it sits furthest from anywhere to spend. Asserting the opposite here would
   * be asserting that the last act must not do the thing it was built to do. */
  if (!(map.act === 3 && MAP.stationBeforeAct3Boss)) {
    memo.clear();
    const clean = walk(map.startId, (node) => {
      if (node.type === 'station') return false;
      return node.id === map.bossId ? true : null;
    });
    if (!clean) problems.push('every route from the origin is forced through a Station');
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
