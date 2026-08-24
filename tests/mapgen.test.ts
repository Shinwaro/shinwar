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
import { ENCOUNTERS } from '../src/content/encounters.ts';
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

  it('never puts two Stations back to back on a path', () => {
    /* Safe Planets had spacing from M2 and Stations did not, so two shops in a
       row was a normal roll — and the second is nearly worthless, because you
       spent at the first.

       The old failure was specifically in FRONT of the guaranteed Station row,
       which was placed unconditionally and so could not be seen by the row
       below it as that row rolled. That row is gone; the spacing rule that
       replaced the special case is what this now holds. */
    for (const seed of SEEDS) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const byId = new Map(map.nodes.map((node) => [node.id, node]));
        for (const node of map.nodes) {
          if (node.type !== 'station') continue;
          for (const id of node.next) {
            expect(byId.get(id)?.type, `${seed} act${act}: ${node.id} -> ${id}`).not.toBe('station');
          }
        }
      }
    }
  });

  it('always lets a route reach a Station, and never makes it', () => {
    /* The two halves of the Station guarantee, and they only mean anything
       together.

       It used to be one row of the act made entirely of Stations, the way the
       row before the boss is made of Safe Planets. That guaranteed a shop by
       removing the decision: measured across 600 acts, every route in all 600
       was forced through it, and the chart showed a solid bar of shops across
       the middle. "I will take the long way round and hit the shop" was not a
       plan you could make, because there was no way round.

       Stated as reachability instead, the guarantee says what it always meant:
       a shop is available to anyone who goes looking, and imposed on nobody. */
    for (const seed of SEEDS.slice(0, 300)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const byId = new Map(map.nodes.map((node) => [node.id, node]));

        const reaches = new Map<string, boolean>();
        const canShop = (id: string): boolean => {
          const seen = reaches.get(id);
          if (seen !== undefined) return seen;
          const node = byId.get(id);
          if (node === undefined) return false;
          reaches.set(id, false);
          const value = node.type === 'station' || node.next.some(canShop);
          reaches.set(id, value);
          return value;
        };

        const avoids = new Map<string, boolean>();
        const canSkip = (id: string): boolean => {
          const seen = avoids.get(id);
          if (seen !== undefined) return seen;
          const node = byId.get(id);
          if (node === undefined || node.type === 'station') return false;
          avoids.set(id, false);
          const value = id === map.bossId || node.next.some(canSkip);
          avoids.set(id, value);
          return value;
        };

        expect(canShop(map.startId), `${seed} act${act}: no route reaches a Station`).toBe(true);
        expect(canSkip(map.startId), `${seed} act${act}: forced through a Station`).toBe(true);
      }
    }
  });

  it('keeps Stations inside the rows they are declared for, and spread out', () => {
    /* The band is written in `MAP.stationRows` as node numbers — before 4 the
       act has not started, after 12 there is no run left to spend on. Asserted
       against the constant rather than against 4 and 12, so moving the band
       moves the test with it.

       The spread half is the reason Robin raised this at all: two Stations
       three rows apart at the middle of the chart is the same "the shops are
       all in one place" the full row was, wearing fewer nodes. */
    let sameRow = 0;
    let charts = 0;
    for (const seed of SEEDS.slice(0, 300)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const rows = MAP.rows[act];
        const low = Math.max(MAP.earliestSpecialRow, MAP.stationRows.from);
        const high = Math.min(rows - 3, MAP.stationRows.to);

        const stations = map.nodes.filter((node) => node.type === 'station');
        expect(stations.length, `${seed} act${act} has no Station at all`).toBeGreaterThan(0);
        for (const node of stations) {
          expect(node.row, `${seed} act${act}: ${node.id}`).toBeGreaterThanOrEqual(low);
          expect(node.row, `${seed} act${act}: ${node.id}`).toBeLessThanOrEqual(high);
        }

        // No row may be entirely Stations. That shape IS the old bug.
        for (let row = 0; row < rows; row++) {
          const cells = map.nodes.filter((node) => node.row === row);
          if (cells.length === 0) continue;
          expect(
            cells.every((node) => node.type === 'station'),
            `${seed} act${act}: row ${row} is all Stations`,
          ).toBe(false);
        }

        charts += 1;
        if (new Set(stations.map((node) => node.row)).size === 1) sameRow += 1;
      }
    }
    /* Most charts should put their shops on more than one row. Not all — a
       chart with a single Station has one row by definition — but a high share
       here means they have quietly collected in one place again. */
    expect(sameRow / charts, 'Stations are collecting on one row').toBeLessThan(0.5);
  });

  it('holds every encounter to its earliest row', () => {
    // Three enemies on the arrival node is not a hard start, it is a different
    // game — the opening twelve cards have not had a reward screen yet.
    const floors = new Map(
      ENCOUNTERS.filter((entry) => entry.minRow !== undefined).map((entry) => [
        entry.id,
        entry.minRow as number,
      ]),
    );
    expect(floors.size).toBeGreaterThan(0);

    for (const seed of SEEDS) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        for (const node of map.nodes) {
          const floor = node.encounterId === null ? undefined : floors.get(node.encounterId);
          if (floor === undefined) continue;
          expect(node.row, `${seed} act${act}: ${node.encounterId} at row ${node.row}`)
            .toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it('gives every Unknown a fight to resolve into', () => {
    /* An Unknown carries a hidden encounter and environment. Without them the
       ambush fell back to "the first encounter anywhere on the chart", which
       includes the elite and boss rosters — so a `?` in Act 1 could roll the
       act boss. */
    for (const seed of SEEDS.slice(0, 300)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        for (const node of map.nodes) {
          if (node.type !== 'unknown') continue;
          expect(node.encounterId, `${seed} act${act}: ${node.id}`).not.toBeNull();
          expect(node.environmentId, `${seed} act${act}: ${node.id}`).not.toBeNull();
        }
      }
    }
  });

  it('never puts two blank-looking nodes back to back on a path', () => {
    /* `event` and `unknown` are the two that show no encounter on the chart.
       Consecutively they read as a stretch where nothing is happening — you
       walk two nodes and have fought nothing — which is what a player notices,
       rather than the overall share of them.

       The Reliquary row is exempt, and the exemption is the point of the rule
       rather than a hole in it: this test is a proxy for "nothing happened",
       and the vault is the single largest decision in the run. A node that
       pins its own Anomaly is never a blank node. */
    const blank = (node: { type: string; eventId: string | null }): boolean =>
      node.eventId === null && (node.type === 'event' || node.type === 'unknown');

    for (const seed of SEEDS) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const byId = new Map(map.nodes.map((node) => [node.id, node]));

        for (const node of map.nodes) {
          if (!blank(node)) continue;
          for (const id of node.next) {
            const ahead = byId.get(id);
            if (ahead === undefined) continue;
            expect(blank(ahead), `${seed} act${act}: ${node.id} -> ${ahead.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('never puts two Safe Planets within MAP.safeSpacing of each other on a path', () => {
    // On a *path*, not on the chart: two rests side by side in the same row are
    // fine, because no single route takes both. What matters is what you meet
    // in sequence — arriving at a second rest still full from the first wastes
    // the choice the node exists for.
    for (const seed of SEEDS) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const byId = new Map(map.nodes.map((node) => [node.id, node]));

        for (const node of map.nodes) {
          if (node.type !== 'safe') continue;
          let frontier = [...node.next];
          for (let step = 1; step <= MAP.safeSpacing; step++) {
            const next: string[] = [];
            for (const id of frontier) {
              const ahead = byId.get(id);
              if (ahead === undefined) continue;
              expect(ahead.type, `${seed} act${act}: ${node.id} -> ${ahead.id} at ${step}`).not.toBe(
                'safe',
              );
              next.push(...ahead.next);
            }
            frontier = next;
          }
        }
      }
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

  it('fights every boss in Clear Space', () => {
    /* The boss is the act's whole argument about your deck, and an environment
       is a rule applied to both sides. Stacked, the hardest fight in the act
       was also the one most decided by a roll the player never saw and never
       chose. Fixing it makes the boss the constant two runs can be compared
       against. */
    for (const seed of SEEDS.slice(0, 200)) {
      for (const act of [1, 2, 3] as const) {
        const { map } = generateMap(createRng(seed), act);
        const boss = map.nodes.find((node) => node.id === map.bossId);
        expect(boss?.type, `${seed} act${act}: bossId is not a boss`).toBe('boss');
        expect(boss?.environmentId, `${seed} act${act} boss`).toBe(CLEAR_SPACE_ID);
      }
    }
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
