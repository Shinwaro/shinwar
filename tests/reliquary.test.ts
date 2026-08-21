/* The Reliquary — one legendary a run, in the middle of the run.
 *
 * Two invariants, and both are the kind that a later change breaks quietly:
 *
 *   1. **Unmissable.** It is a full row in the middle of Act 2, so no route
 *      can go around it. If it were merely likely, the best card in a run
 *      would be a die roll again, which is the thing it exists to stop.
 *
 *   2. **Sole source.** No reward screen, shop, Thread or Anomaly may hand out
 *      a legendary or artifact card. The gate is in `offerableCards`, the
 *      weights are zero, and every top-tier card has to be reachable from the
 *      Reliquary — otherwise it is in the game and unobtainable.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { RunEffect } from '../src/engine/types.ts';
import { applyAction, applyActions } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { generateMap, reliquaryRowFor } from '../src/engine/map/mapgen.ts';
import { createRng } from '../src/engine/rng.ts';
import { offerableCards } from '../src/engine/run/rewards.ts';
import { availableMoves } from '../src/engine/map/route.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable, events as eventTable } from '../src/content/registry.ts';
import { RARITY_WEIGHTS } from '../src/content/balance.ts';
import { RELIQUARY_EVENT_ID } from '../src/content/events/reliquary.ts';

beforeEach(() => {
  reloadContent();
});

/** Every card id any Reliquary option hands over. */
function reliquaryCardIds(): readonly string[] {
  const def = eventTable.get(RELIQUARY_EVENT_ID);
  const ids: string[] = [];
  for (const option of def.options) {
    for (const effect of option.effects as readonly RunEffect[]) {
      if (effect.op === 'card') ids.push(effect.cardId);
    }
  }
  return ids;
}

describe('placement', () => {
  it('puts a full row of it in the middle of Act 2, on every seed', () => {
    for (let i = 0; i < 200; i++) {
      const generated = generateMap(createRng(`RELIC-${i}`), 2);
      const row = reliquaryRowFor(
        Math.max(...generated.map.nodes.map((node) => node.row)) + 1,
      );
      const onRow = generated.map.nodes.filter((node) => node.row === row);

      expect(onRow.length, `seed ${i}: empty reliquary row`).toBeGreaterThan(0);
      for (const node of onRow) {
        expect(node.type, `seed ${i}: ${node.id}`).toBe('event');
        expect(node.eventId, `seed ${i}: ${node.id}`).toBe(RELIQUARY_EVENT_ID);
      }
    }
  });

  it('is unmissable — every route through Act 2 crosses it', () => {
    /* A full row is only unmissable if the row spans the lane. Walked rather
       than asserted structurally: the point is that a *player* cannot avoid
       it, and reachability is the property that says so. */
    for (let i = 0; i < 40; i++) {
      const generated = generateMap(createRng(`ROUTE-${i}`), 2);
      const nodes = new Map(generated.map.nodes.map((node) => [node.id, node]));
      const row = reliquaryRowFor(
        Math.max(...generated.map.nodes.map((node) => node.row)) + 1,
      );

      // Walk every reachable path forward, tracking whether it crossed the row.
      const seen = new Set<string>();
      const stack = [generated.map.startId];
      let crossings = 0;
      let leaves = 0;

      while (stack.length > 0) {
        const id = stack.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = nodes.get(id);
        if (node === undefined) continue;
        if (node.row === row) {
          crossings += 1;
          continue; // everything past here already went through the row
        }
        if (node.next.length === 0) leaves += 1;
        for (const next of node.next) stack.push(next);
      }

      expect(crossings, `seed ${i}: nothing reached the reliquary row`).toBeGreaterThan(0);
      // No path may terminate before reaching the row.
      expect(leaves, `seed ${i}: a route ended short of the reliquary row`).toBe(0);
    }
  });

  it('does not exist in Act 1 or Act 3', () => {
    for (const act of [1, 3] as const) {
      for (let i = 0; i < 40; i++) {
        const generated = generateMap(createRng(`ELSEWHERE-${act}-${i}`), act);
        for (const node of generated.map.nodes) {
          expect(node.eventId, `act ${act} seed ${i}`).toBeNull();
        }
      }
    }
  });
});

describe('the gate', () => {
  it('offers no legendary or artifact anywhere else', () => {
    for (const card of offerableCards()) {
      expect(card.rarity, card.id).not.toBe('legendary');
      expect(card.rarity, card.id).not.toBe('artifact');
    }
    for (const act of [1, 2, 3] as const) {
      expect(RARITY_WEIGHTS[act].legendary).toBe(0);
      expect(RARITY_WEIGHTS[act].artifact).toBe(0);
    }
  });

  it('makes every top-tier card reachable from the Reliquary', () => {
    /* The other half of the gate, and the half that rots: a legendary added
       later and not wired into the vault is a card in the game that no run can
       ever hold. */
    const top = cardTable
      .all()
      .filter((card) => card.rarity === 'legendary' || card.rarity === 'artifact');
    expect(top.length).toBeGreaterThan(0);

    const offered = new Set(reliquaryCardIds());
    for (const card of top) {
      expect(offered.has(card.id), `${card.id} is top-tier and unobtainable`).toBe(true);
    }
  });

  it('hands over exactly one card per option', () => {
    // "One legendary a run" is only true if no single option pays two.
    const def = eventTable.get(RELIQUARY_EVENT_ID);
    for (const option of def.options) {
      const cards = (option.effects as readonly RunEffect[]).filter(
        (effect) => effect.op === 'card',
      );
      expect(cards.length, `${option.id} hands over ${cards.length} cards`).toBeLessThanOrEqual(1);
    }
  });

  it('never turns up as an ordinary Anomaly', () => {
    // `pinnedOnly` keeps it out of the roll. Without it the vault could appear
    // twice in a run, or in Act 2 before its own row.
    expect(eventTable.get(RELIQUARY_EVENT_ID).pinnedOnly).toBe(true);
  });
});

describe('walking into it', () => {
  it('opens the Reliquary rather than rolling an Anomaly', () => {
    /* The pin has to beat the roll. Without it the node would open whatever
       the events stream produced next, and the vault would be a normal
       Anomaly that happened to be guaranteed. */
    const generated = generateMap(createRng('WALK-RELIC'), 2);
    const rows = Math.max(...generated.map.nodes.map((node) => node.row)) + 1;
    const row = reliquaryRowFor(rows);

    // Stand one row short, on something that leads into the vault row.
    const approach = generated.map.nodes.find(
      (node) =>
        node.row === row - 1 &&
        node.next.some((id) => generated.map.nodes.find((n) => n.id === id)?.row === row),
    );
    expect(approach, 'no node leads into the reliquary row').toBeDefined();

    const target = approach!.next
      .map((id) => generated.map.nodes.find((node) => node.id === id))
      .find((node) => node?.row === row);
    expect(target?.eventId).toBe(RELIQUARY_EVENT_ID);

    const base = applyActions(createInitialState('WALK-RELIC'), [{ kind: 'beginRun' }]);
    const staged = {
      ...base,
      run: {
        ...base.run!,
        act: 2 as const,
        map: generated.map,
        position: approach!.id,
        screen: 'map' as const,
        visited: [approach!.id],
      },
    };

    expect(availableMoves(staged.run).some((node) => node.id === target!.id)).toBe(true);

    let state = applyAction(staged, { kind: 'moveToNode', nodeId: target!.id });
    if (state.run?.screen === 'landing') state = applyAction(state, { kind: 'leaveLanding' });

    expect(state.run?.screen).toBe('event');
    expect(state.run?.pendingEvent?.eventId).toBe(RELIQUARY_EVENT_ID);
  });
});
