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
import { CLEAR_SPACE_ID, ENVIRONMENTS } from '../src/content/environments.ts';

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

  it('always starts from the same single origin', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      const origins = map.nodes.filter((node) => node.row === 0);
      expect(origins, `${seed} has ${origins.length} origins`).toHaveLength(1);
      expect(origins[0]?.id).toBe(map.startId);
      expect(origins[0]?.type).toBe('combat');
    }
  });

  it('fans the origin out into three to six lanes', () => {
    const widths = new Set<number>();
    for (const seed of SEEDS) {
      const { map } = generateMap(createRng(seed), 1);
      const origin = map.nodes.find((node) => node.id === map.startId);
      const lanes = origin?.next.length ?? 0;
      expect(lanes, `${seed} fans into ${lanes}`).toBeGreaterThanOrEqual(MAP.branches.min);
      expect(lanes).toBeLessThanOrEqual(MAP.branches.max);
      widths.add(lanes);
    }
    // And the width actually varies run to run, rather than being nominally a
    // range that always rolls the same number.
    expect(widths.size).toBeGreaterThan(1);
  });

  it('leaves no node stranded off the origin', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      const byId = new Map(map.nodes.map((node) => [node.id, node]));
      const seen = new Set<string>();
      const stack = [map.startId];
      while (stack.length > 0) {
        const id = stack.pop();
        if (id === undefined || seen.has(id)) continue;
        seen.add(id);
        for (const next of byId.get(id)?.next ?? []) stack.push(next);
      }
      expect(seen.size, `${seed} strands ${map.nodes.length - seen.size} nodes`).toBe(map.nodes.length);
    }
  });

  it('places every node inside the chart', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { map } = generateMap(createRng(seed), 1);
      for (const node of map.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(1);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(1);
      }
      // The origin sits at the bottom, the boss at the top.
      const origin = map.nodes.find((node) => node.id === map.startId);
      const boss = map.nodes.find((node) => node.id === map.bossId);
      expect(origin!.y).toBeGreaterThan(boss!.y);
      expect(origin!.x).toBeCloseTo(0.5, 5);
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
    const known = new Set(ENVIRONMENTS.map((entry) => entry.id));
    for (const seed of SEEDS.slice(0, 200)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        for (const node of map.nodes) {
          if (node.type !== 'combat' && node.type !== 'elite' && node.type !== 'boss') continue;
          expect(node.encounterId, `${seed} ${node.id} has no encounter`).not.toBeNull();
          // The badge is half the route decision, so it can never be missing
          // and can never name something the registry does not have.
          expect(known.has(node.environmentId ?? ''), `${seed} ${node.id}`).toBe(true);
        }
      }
    }
  });

  it('opens Act 1 in Clear Space, and only Act 1', () => {
    // A modifier on the very first fight would bury the stance layer while it
    // is still being learned. By Act 2 the badge is information, not noise.
    let laterActsVary = false;
    for (const seed of SEEDS.slice(0, 120)) {
      const act1 = generateMap(createRng(seed), 1).map;
      const origin = act1.nodes.find((node) => node.id === act1.startId);
      expect(origin?.environmentId, `${seed} act 1 origin`).toBe(CLEAR_SPACE_ID);

      const act3 = generateMap(createRng(seed), 3).map;
      const later = act3.nodes.find((node) => node.id === act3.startId);
      if (later?.environmentId !== CLEAR_SPACE_ID) laterActsVary = true;
    }
    expect(laterActsVary, 'no Act 3 origin ever rolled anything but Clear Space').toBe(true);
  });

  it('only offers an environment where that environment belongs', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        for (const node of map.nodes) {
          if (node.environmentId === null) continue;
          const def = ENVIRONMENTS.find((entry) => entry.id === node.environmentId);
          const acts = def?.acts;
          if (acts === undefined) continue;
          expect(acts.includes(act), `${seed} ${node.id}: ${node.environmentId} in act ${act}`).toBe(true);
        }
      }
    }
  });

  it('leaves ship fights in Clear Space, because the modifiers are for the deck', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        for (const node of map.nodes) {
          if (node.arena !== 'space' || node.environmentId === null) continue;
          expect(node.environmentId, `${seed} ${node.id}`).toBe(CLEAR_SPACE_ID);
        }
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
    expect(opening.map((node) => node.id)).toEqual([run.map!.startId]);

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
