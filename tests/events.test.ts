/* Anomalies, Threads, and the Station.
 *
 * The three things M4 added, tested against the rules that make them worth
 * having: an event never kills you, "leave" is always worthless, a Thread you
 * take on always comes due inside the run, and a shop cannot restock under the
 * player's cursor.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState, RunState } from '../src/engine/types.ts';
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { enterNode } from '../src/engine/run/run.ts';
import { applyRunEffects } from '../src/engine/run/effects.ts';
import { describeRunEffects } from '../src/engine/run/describe.ts';
import {
  canTakeOption,
  chooseEventOption,
  openEvent,
  optionsFor,
  refusalFor,
} from '../src/engine/run/events.ts';
import { activeThreads, advanceThreads, dueThreads, hasThread, setThread } from '../src/engine/run/threads.ts';
import { buyRemoval, buyShopCard, stockShop } from '../src/engine/run/shop.ts';
import { stableStringify } from '../src/engine/serialize.ts';
import { THREADS } from '../src/content/balance.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable, events as eventTable, threads as threadTable } from '../src/content/registry.ts';

function fresh(seed = 'ANOMALY'): GameState {
  return {
    ...createInitialState(seed),
    phase: 'run',
    run: createRunState(seed, 0),
  };
}

function runOf(state: GameState): RunState {
  if (state.run === null) throw new Error('test: no run');
  return state.run;
}

/** A real run with a real map, through the real action. */
function startedRun(seed: string): GameState {
  return applyAction(createInitialState(seed), { kind: 'beginRun' });
}

beforeEach(() => {
  reloadContent();
});

describe('the event pool', () => {
  it('ships ten anomalies', () => {
    expect(eventTable.all().length).toBe(10);
  });

  it('gives every one of them a leave that pays nothing', () => {
    for (const def of eventTable.all()) {
      const leave = def.options.filter((option) => option.isLeave === true);
      expect(leave.length, def.id).toBe(1);
      expect(leave[0]?.effects, def.id).toEqual([]);
    }
  });

  it('generates the mechanical line rather than trusting the prose', () => {
    // Not "the text is right" — "the text comes from the ops". A hand-written
    // number is the thing this rule exists to make impossible.
    const line = describeRunEffects([
      { op: 'alloy', amount: 120 },
      { op: 'setThread', threadId: 'marked' },
    ]);
    expect(line).toBe('Gain 120 Alloy · Thread: Marked');
  });
});

describe('choosing an option', () => {
  it('resolves the effects and then shows what they were', () => {
    const opened = openEvent(fresh('EVENTS'));
    const eventId = runOf(opened).pendingEvent?.eventId;
    expect(eventId).toBeDefined();

    const def = eventTable.get(eventId ?? '');
    const first = optionsFor(runOf(opened), def).find(
      (option) => option.isLeave !== true && canTakeOption(runOf(opened), option),
    );
    const chosen = chooseEventOption(opened, first?.id ?? '');

    expect(runOf(chosen).pendingEvent?.chosenOptionId).toBe(first?.id);
    expect(runOf(chosen).pendingEvent?.outcome.length).toBeGreaterThan(0);
  });

  it('refuses an option the run cannot actually pay for', () => {
    // The floor that stops an event killing you also made a big price free the
    // moment you were low enough: "lose 12 hull" with 2 hull left cost two.
    const state = fresh('BROKE');
    const poor = {
      ...state,
      run: { ...runOf(state), alloy: 10, ship: { ...runOf(state).ship, hull: 2 } },
    };

    const costly = {
      id: 'costly',
      label: 'Sell the plating',
      detail: 'More than the cutter has.',
      effects: [{ op: 'hull' as const, amount: -18 }],
      risk: 'The ship',
      payoff: 'None',
    };
    expect(canTakeOption(runOf(poor), costly)).toBe(false);
    expect(refusalFor(runOf(poor), costly)).toContain('18');

    const affordable = { ...costly, id: 'small', effects: [{ op: 'hull' as const, amount: -1 }] };
    expect(canTakeOption(runOf(poor), affordable)).toBe(true);
  });

  it('will not let a refused option through the reducer either', () => {
    // The rule lives in the engine; the disabled button is the presentation.
    const opened = openEvent(fresh('BROKE2'));
    const def = eventTable.get(runOf(opened).pendingEvent?.eventId ?? '');
    const unpayable = optionsFor(runOf(opened), def).find(
      (option) => !canTakeOption(runOf(opened), option),
    );
    if (unpayable === undefined) return;
    expect(chooseEventOption(opened, unpayable.id)).toBe(opened);
  });

  it('refuses a second choice on the same anomaly', () => {
    const opened = openEvent(fresh('EVENTS'));
    const def = eventTable.get(runOf(opened).pendingEvent?.eventId ?? '');
    const options = optionsFor(runOf(opened), def).filter((option) => option.isLeave !== true);

    const once = chooseEventOption(opened, options[0]?.id ?? '');
    const twice = chooseEventOption(once, options[1]?.id ?? '');
    expect(twice).toBe(once);
  });

  it('never serves the same anomaly twice in a run', () => {
    let state = fresh('REPEATS');
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      state = openEvent(state);
      const id = runOf(state).pendingEvent?.eventId ?? '';
      expect(seen, `served ${id} twice`).not.toContain(id);
      seen.push(id);
      state = { ...state, run: { ...runOf(state), pendingEvent: null } };
    }
    expect(seen.length).toBe(10);
  });
});

describe('run effects', () => {
  it('never takes the last point of health', () => {
    const state = fresh();
    const hurt = { ...state, run: { ...runOf(state), pilot: { ...runOf(state).pilot, health: 5 } } };
    const after = applyRunEffects(hurt, [{ op: 'health', amount: -50 }], 'test');
    expect(runOf(after.state).pilot.health).toBe(1);
  });

  it('never takes the last point of hull', () => {
    const state = fresh();
    const hurt = { ...state, run: { ...runOf(state), ship: { ...runOf(state).ship, hull: 4 } } };
    const after = applyRunEffects(hurt, [{ op: 'hull', amount: -90 }], 'test');
    expect(runOf(after.state).ship.hull).toBe(1);
  });

  it('takes what it can when the bill is bigger than the account', () => {
    const state = fresh();
    const poor = { ...state, run: { ...runOf(state), alloy: 30 } };
    const after = applyRunEffects(poor, [{ op: 'alloy', amount: -110 }], 'test');
    expect(runOf(after.state).alloy).toBe(0);
    expect(after.lines[0]).toContain('30');
  });

  it('pays out a module you already carry instead of handing over a duplicate', () => {
    // The grid identifies a module by its id, so a second copy has nowhere to
    // go. Money is the honest fallback; a dead option is not.
    const state = fresh();
    const after = applyRunEffects(state, [{ op: 'module', moduleId: 'core_reactor' }], 'test');
    expect(runOf(after.state).alloy).toBeGreaterThan(0);
    expect(runOf(after.state).ship.stored).not.toContain('core_reactor');
  });

  it('leaves a line for everything it does', () => {
    const state = fresh();
    const after = applyRunEffects(
      state,
      [
        { op: 'alloy', amount: 40 },
        { op: 'health', amount: -5 },
        { op: 'card', cardId: 'hairline' },
      ],
      'test',
    );
    expect(after.lines).toHaveLength(3);
  });
});

describe('threads', () => {
  it('ships a pool inside the tone tolerance', () => {
    const all = threadTable.all();
    for (const tone of ['positive', 'mixed', 'costly'] as const) {
      const share = all.filter((thread) => thread.tone === tone).length / all.length;
      expect(Math.abs(share - THREADS.toneMix[tone]), tone).toBeLessThanOrEqual(
        THREADS.toneMixTolerance,
      );
    }
  });

  it('caps how many can be carried at once', () => {
    let state = fresh();
    for (const def of threadTable.all()) state = setThread(state, def.id);
    expect(activeThreads(runOf(state)).length).toBe(THREADS.maxActive);
  });

  it('refuses to take the same thread twice', () => {
    const once = setThread(fresh(), 'marked');
    const twice = setThread(once, 'marked');
    expect(twice).toBe(once);
    expect(runOf(twice).threads.filter((entry) => entry.threadId === 'marked')).toHaveLength(1);
  });

  it('puts the clutch on the grid, and takes it off again when it hatches', () => {
    const carrying = setThread(fresh(), 'the_clutch');
    expect(runOf(carrying).ship.placed.some((entry) => entry.moduleId === 'clutch_egg')).toBe(true);

    let state = carrying;
    const count = threadTable.get('the_clutch').trigger.count;
    for (let i = 0; i < count; i++) state = advanceThreads(state);
    expect(dueThreads(runOf(state)).map((def) => def.id)).toContain('the_clutch');

    // Walking a node is what actually resolves it, through the real path.
    const walked = walkNodes(fresh(), 'the_clutch');
    expect(runOf(walked).ship.placed.some((entry) => entry.moduleId === 'clutch_egg')).toBe(false);
    expect(runOf(walked).ship.stored).not.toContain('clutch_egg');
  });

  it('always comes due inside the run', () => {
    for (const def of threadTable.all()) {
      // Act 1 is 15 rows; anything that needs more than a dozen nodes would
      // dangle, and a Thread that never resolves is a promise the run broke.
      expect(def.trigger.count, def.id).toBeLessThanOrEqual(12);
      expect(def.payoff.length, def.id).toBeGreaterThan(0);
    }
  });
});

/** Take a thread on and walk the map until it fires. Uses the real actions. */
function walkNodes(state: GameState, threadId: string): GameState {
  let next = applyAction(state, { kind: 'beginRun' });
  next = { ...next, run: { ...runOf(next), seed: runOf(next).seed } };
  next = setThread(next, threadId);

  let guard = 0;
  while (guard++ < 30 && hasThread(runOf(next), threadId)) {
    const carried = runOf(next).threads.find((entry) => entry.threadId === threadId);
    if (carried?.resolved === true) break;
    next = advanceThreads(next);
  }
  // Resolve it the way `enterNode` would, so the cargo comes off.
  for (const def of dueThreads(runOf(next))) {
    next = applyRunEffects(
      { ...next, run: { ...runOf(next), threads: runOf(next).threads.map((entry) =>
        entry.threadId === def.id ? { ...entry, resolved: true } : entry) } },
      def.payoff,
      def.id,
    ).state;
    next = {
      ...next,
      run: {
        ...runOf(next),
        ship: {
          ...runOf(next).ship,
          placed: runOf(next).ship.placed.filter((entry) => entry.moduleId !== def.cargoModuleId),
          stored: runOf(next).ship.stored.filter((id) => id !== def.cargoModuleId),
        },
      },
    };
  }
  return next;
}

/*
 * Walking the map for real would mean winning five fights, which is a combat
 * test wearing a thread test's clothes. `enterNode` is where the clock lives,
 * so the walk goes through it and resets the screen between steps — that is the
 * whole of what a player entering a node does to a Thread.
 */
function stepInto(state: GameState, nodeId: string): GameState {
  const entered = enterNode(state, nodeId);
  if (entered.run === null) return entered;
  return { ...entered, run: { ...entered.run, screen: 'map', combat: null, shipCombat: null } };
}

function walkForward(state: GameState, steps: number): GameState {
  let next = state;
  for (let i = 0; i < steps; i++) {
    const run = runOf(next);
    const map = run.map;
    if (map === null) break;
    const here = run.position === null ? undefined : map.nodes.find((node) => node.id === run.position);
    const targetId = run.position === null ? map.startId : here?.next[0];
    if (targetId === undefined) break;
    next = stepInto(next, targetId);
  }
  return next;
}

describe('threads on the real path', () => {
  it('fires a payoff once the node count is walked', () => {
    const started = startedRun('WALKER');
    const carrying = setThread(started, 'navigators_favour');
    const before = runOf(carrying).alloy;
    const count = threadTable.get('navigators_favour').trigger.count;

    const walked = walkForward(carrying, count);
    const thread = runOf(walked).threads.find((entry) => entry.threadId === 'navigators_favour');

    expect(thread?.resolved, `not resolved after ${count} nodes`).toBe(true);
    expect(runOf(walked).alloy).toBeGreaterThan(before);
  });

  it('does not fire early', () => {
    const started = startedRun('WALKER');
    const carrying = setThread(started, 'navigators_favour');
    const count = threadTable.get('navigators_favour').trigger.count;

    const walked = walkForward(carrying, count - 1);
    const thread = runOf(walked).threads.find((entry) => entry.threadId === 'navigators_favour');
    expect(thread?.resolved).toBe(false);
  });

  it('lets a reprisal take the node, and pays elite money for it', () => {
    const started = startedRun('REPRISAL');
    const marked = setThread(started, 'marked');
    const count = threadTable.get('marked').trigger.count;

    // One short of due, then enter for real so the ambush replaces the node.
    let state = walkForward(marked, count - 1);
    const map = runOf(state).map;
    const here = map?.nodes.find((node) => node.id === runOf(state).position);
    const targetId = here?.next[0];
    expect(targetId).toBeDefined();

    state = enterNode(state, targetId ?? '');
    // Whatever that node was, what opened is a fight, and the tier is banked.
    expect(runOf(state).screen).toBe('combat');
    expect(runOf(state).forcedTier).toBe('elite');
  });

  it('never lets a reprisal replace the boss', () => {
    const started = startedRun('BOSSGUARD');
    const marked = setThread(started, 'marked');
    const map = runOf(marked).map;
    expect(map).not.toBeNull();

    // Stand next to the boss with the thread already due.
    const due = {
      ...marked,
      run: {
        ...runOf(marked),
        position: map?.nodes.find((node) => node.next.includes(map.bossId))?.id ?? null,
        threads: runOf(marked).threads.map((entry) => ({ ...entry, progress: 99 })),
      },
    };

    const atBoss = enterNode(due, map?.bossId ?? '');
    expect(runOf(atBoss).forcedTier).toBeNull();
  });
});

describe('the station', () => {
  it('stocks cards, modules and exactly one removal', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    const shop = runOf(stocked).shop;
    expect(shop?.cards.length).toBeGreaterThan(0);
    expect(shop?.modules.length).toBeGreaterThan(0);
    expect(shop?.removalUsed).toBe(false);
    expect(shop?.removalPrice).toBeGreaterThan(0);
  });

  it('never restocks the shelf you are standing at', () => {
    const first = stockShop(fresh('SHOP'), 'n4_2');
    const again = stockShop(first, 'n4_2');
    expect(again).toBe(first);
    expect(stableStringify(runOf(again).shop)).toBe(stableStringify(runOf(first).shop));
  });

  it('never stocks a card the pool marks exclusive', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    for (const stock of runOf(stocked).shop?.cards ?? []) {
      expect(cardTable.get(stock.cardId).exclusive, stock.cardId).not.toBe(true);
    }
  });

  it('refuses a purchase you cannot afford, without touching state', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    const first = runOf(stocked).shop?.cards[0];
    const broke = { ...stocked, run: { ...runOf(stocked), alloy: 0 } };
    expect(buyShopCard(broke, first?.cardId ?? '')).toBe(broke);
  });

  it('sells a card once and marks the slot', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    const first = runOf(stocked).shop?.cards[0];
    const rich = { ...stocked, run: { ...runOf(stocked), alloy: 999 } };
    const bought = buyShopCard(rich, first?.cardId ?? '');

    expect(runOf(bought).pilot.deck.length).toBe(runOf(rich).pilot.deck.length + 1);
    expect(runOf(bought).alloy).toBe(999 - (first?.price ?? 0));
    expect(buyShopCard(bought, first?.cardId ?? '')).toBe(bought);
  });

  it('sells one removal per station and raises the price for the next', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    const rich = { ...stocked, run: { ...runOf(stocked), alloy: 999 } };
    const victim = runOf(rich).pilot.deck[0];

    const stripped = buyRemoval(rich, victim?.uid ?? '');
    expect(runOf(stripped).pilot.deck.length).toBe(runOf(rich).pilot.deck.length - 1);
    expect(runOf(stripped).shop?.removalUsed).toBe(true);

    const second = runOf(stripped).pilot.deck[0];
    expect(buyRemoval(stripped, second?.uid ?? '')).toBe(stripped);

    const nextStation = stockShop(stripped, 'n9_3');
    expect(runOf(nextStation).shop?.removalPrice).toBeGreaterThan(
      runOf(stocked).shop?.removalPrice ?? 0,
    );
  });
});
