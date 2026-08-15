/* Routing — where the player may go from here.
 *
 * Read-only. The reducer moves the player; this only answers questions, and
 * the UI asks rather than working it out for itself.
 */

import type { GameState, MapNode, RunMap, RunState } from '../types.ts';

export function nodeById(map: RunMap, id: string): MapNode | undefined {
  return map.nodes.find((node) => node.id === id);
}

export function currentNode(run: RunState): MapNode | null {
  if (run.map === null || run.position === null) return null;
  return nodeById(run.map, run.position) ?? null;
}

/**
 * The nodes the player may move to. Before the first move that is every entry
 * on row 0; afterwards it is whatever the current node leads to.
 */
export function availableMoves(run: RunState): readonly MapNode[] {
  const map = run.map;
  if (map === null) return [];

  if (run.position === null) {
    return map.entries
      .map((id) => nodeById(map, id))
      .filter((node): node is MapNode => node !== undefined);
  }

  const here = nodeById(map, run.position);
  if (here === undefined) return [];
  return here.next
    .map((id) => nodeById(map, id))
    .filter((node): node is MapNode => node !== undefined);
}

export function canMoveTo(run: RunState, nodeId: string): boolean {
  return availableMoves(run).some((node) => node.id === nodeId);
}

/** Rows, top to bottom as drawn — the boss row first, the entries last. */
export function rowsOf(map: RunMap): readonly (readonly MapNode[])[] {
  const rows = Math.max(...map.nodes.map((node) => node.row)) + 1;
  return Array.from({ length: rows }, (_, row) =>
    map.nodes.filter((node) => node.row === row).sort((a, b) => a.col - b.col),
  ).reverse();
}

/** How far up the act the player has come, 0 to 1. Drives the act progress readout. */
export function actProgress(run: RunState): number {
  const map = run.map;
  if (map === null) return 0;
  const rows = Math.max(...map.nodes.map((node) => node.row)) + 1;
  const here = currentNode(run);
  if (here === null) return 0;
  return Math.min(1, (here.row + 1) / rows);
}

export function isBoss(run: RunState, nodeId: string): boolean {
  return run.map?.bossId === nodeId;
}

/** Plain words for the node badge. The UI never writes its own. */
export function describeNode(node: MapNode): string {
  switch (node.type) {
    case 'combat':
      return 'Combat';
    case 'elite':
      return 'Elite';
    case 'boss':
      return 'Boss';
    case 'event':
      return 'Anomaly';
    case 'station':
      return 'Station';
    case 'safe':
      return 'Safe Planet';
    case 'unknown':
      return 'Unknown';
    case 'crash':
      return 'Crash Site';
    case 'wreck':
      return 'Wreck';
    default: {
      const unreachable: never = node.type;
      return unreachable;
    }
  }
}

export function mapOf(state: GameState): RunMap | null {
  return state.run?.map ?? null;
}
