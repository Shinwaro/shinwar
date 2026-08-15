/* Map generation invariants.
 *
 * The guarantees from the build prompt §5, across a thousand seeds. A map that
 * violates one of these is not a cosmetic problem — an unreachable boss or a
 * missing Station ends a run for a reason the player cannot see.
 */

import { describe, expect, it } from 'vitest';
import { generateMap, mapProblems } from '../src/engine/map/mapgen.ts';
import { availableMoves, rowsOf } from '../src/engine/map/route.ts';
import { createRng } from '../src/engine/rng.ts';
import { createRunState } from '../src/engine/state.ts';
import { MAP } from '../src/content/balance.ts';
import { CLEAR_SPACE_ID } from '../src/content/environments.ts';

const SEEDS = Array.from({ length: 1000 }, (_, i) => `MAP-${i}`);

describe('the guarantees, across 1000 seeds', () => {
  it('hold every time', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const generated = generateMap(createRng(seed), 1);
      const problems = mapProblems(generated.map);
      if (problems.length > 0) failures.push(`${seed}: ${problems.join('; ')}`);
    }
    expect(failures.slice(0, 10).join('\n')).toBe('');
  });

  it('never strands a node with nowhere to go', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      for (const node of map.nodes) {
        if (node.id === map.bossId) continue;
        expect(node.next.length, `${seed} ${node.id} is a dead end`).toBeGreaterThan(0);
      }
    }
  });

  it('offers a real first choice', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      expect(map.entries.length, `${seed} opens on one node`).toBeGreaterThan(1);
    }
  });

  it('funnels into a single boss', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      const bossRow = map.nodes.filter((node) => node.row === MAP.rows[1] - 1);
      expect(bossRow).toHaveLength(1);
      expect(bossRow[0]?.id).toBe(map.bossId);
      expect(bossRow[0]?.type).toBe('boss');
    }
  });

  it('keeps every node inside the lane', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      for (const node of map.nodes) {
        expect(node.col).toBeGreaterThanOrEqual(0);
        expect(node.col).toBeLessThan(MAP.columns);
      }
    }
  });

  it('gives every combat node an encounter and a visible environment', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      for (const node of map.nodes) {
        if (node.type !== 'combat' && node.type !== 'elite' && node.type !== 'boss') continue;
        expect(node.encounterId, `${seed} ${node.id} has no encounter`).not.toBeNull();
        expect(node.environmentId).toBe(CLEAR_SPACE_ID);
      }
    }
  });
});

describe('determinism', () => {
  it('gives the same map for the same seed', () => {
    const a = generateMap(createRng('STABLE'), 1).map;
    const b = generateMap(createRng('STABLE'), 1).map;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('gives different maps for different seeds', () => {
    const a = generateMap(createRng('ALPHA-2222'), 1).map;
    const b = generateMap(createRng('BRAVO-3333'), 1).map;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('does not move the combat stream', () => {
    // The whole point of named streams: generating a map must leave every
    // other stream byte-identical.
    const before = createRng('STREAMS');
    const after = generateMap(before, 1).rng;
    expect(after.combat).toBe(before.combat);
    expect(after.shop).toBe(before.shop);
    expect(after.map).not.toBe(before.map);
  });
});

describe('routing', () => {
  it('opens on the entry row, then follows the edges', () => {
    const run = { ...createRunState('ROUTE', 0), map: generateMap(createRng('ROUTE'), 1).map };
    const opening = availableMoves(run);
    expect(opening.map((node) => node.id).sort()).toEqual([...run.map!.entries].sort());

    const first = opening[0];
    expect(first).toBeDefined();
    const moved = { ...run, position: first!.id };
    expect(availableMoves(moved).map((node) => node.id)).toEqual([...first!.next]);
  });

  it('draws rows boss-first', () => {
    const map = generateMap(createRng('ROWS'), 1).map;
    const rows = rowsOf(map);
    expect(rows[0]?.[0]?.type).toBe('boss');
    expect(rows[rows.length - 1]?.every((node) => node.row === 0)).toBe(true);
  });
});
