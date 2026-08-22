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
import { activeThreads, setThread } from '../src/engine/run/threads.ts';
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
  it('ships enough anomalies that a run does not exhaust the pool', () => {
    /*
     * An exact count was fine at M4 and became a chore the moment the pool grew.
     * What actually matters is the floor: an Anomaly is spent once per run
     * (`seenEvents`), and a run walks somewhere near twenty of them, so a pool
     * below that guarantees the back half of every run repeats itself.
     */
    expect(eventTable.all().length).toBeGreaterThanOrEqual(20);
  });

  it('offers something in every act', () => {
    // An `acts` restriction is how a late Anomaly gets to assume you have a
    // deck and some Alloy. It is also how a pool accidentally empties for Act 1.
    for (const act of [1, 2, 3] as const) {
      const forAct = eventTable.all().filter((def) => def.acts === undefined || def.acts.includes(act));
      expect(forAct.length, `act ${act}`).toBeGreaterThanOrEqual(12);
    }
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
    // moment you were low enough: "lose 12 health" with 2 left cost two.
    const state = fresh('BROKE');
    const poor = {
      ...state,
      run: { ...runOf(state), alloy: 10, pilot: { ...runOf(state).pilot, health: 2 } },
    };

    const costly = {
      id: 'costly',
      label: 'Take the wound',
      detail: 'More than you have left.',
      effects: [{ op: 'health' as const, amount: -18 }],
      risk: 'The body',
      payoff: 'None',
    };
    expect(canTakeOption(runOf(poor), costly)).toBe(false);
    expect(refusalFor(runOf(poor), costly)).toContain('18');

    const affordable = { ...costly, id: 'small', effects: [{ op: 'health' as const, amount: -1 }] };
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

  it('takes what it can when the bill is bigger than the account', () => {
    const state = fresh();
    const poor = { ...state, run: { ...runOf(state), alloy: 30 } };
    const after = applyRunEffects(poor, [{ op: 'alloy', amount: -110 }], 'test');
    expect(runOf(after.state).alloy).toBe(0);
    expect(after.lines[0]).toContain('30');
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

  it('always comes due inside the run', () => {
    for (const def of threadTable.all()) {
      // Act 1 is 15 rows; anything that needs more than a dozen nodes would
      // dangle, and a Thread that never resolves is a promise the run broke.
      expect(def.trigger.count, def.id).toBeLessThanOrEqual(12);
      expect(def.payoff.length, def.id).toBeGreaterThan(0);
    }
  });

  it('can actually be reached, every one of them', () => {
    /* The tone test above reads the POOL. This one reads what the pool is
       wired to, and the two disagreed for a whole milestone: `salvage_claim`,
       `the_passenger` and `borrowed_charts` were defined, validated, tone-mixed
       and referenced by nothing. Three of the ten Threads — and three of the
       four *mixed* ones, which the design calls the most interesting kind —
       could not occur in any run, while the tone test happily reported a
       healthy 30/40/30 split of content half of which was unreachable.

       Same shape as the enemy-mark bug: a registry entry nothing points at
       fails silently and looks exactly like a thing that has not happened yet.
       So this asserts the direction that rots. */
    const reachable = new Set(
      eventTable
        .all()
        .flatMap((event) => event.options)
        .flatMap((option) => option.effects)
        .flatMap((effect) => (effect.op === 'setThread' ? [effect.threadId] : [])),
    );

    const orphans = threadTable
      .all()
      .map((def) => def.id)
      .filter((id) => !reachable.has(id));

    expect(orphans, 'threads no event can open').toEqual([]);
  });

  it('opens no thread that does not exist', () => {
    // The other direction, which fails loudly rather than silently — but only
    // when that option is taken, which may be a hundred runs away.
    const known = new Set(threadTable.all().map((def) => def.id));
    const dangling = eventTable
      .all()
      .flatMap((event) => event.options.map((option) => ({ event: event.id, option })))
      .flatMap(({ event, option }) =>
        option.effects.flatMap((effect) =>
          effect.op === 'setThread' && !known.has(effect.threadId)
            ? [`${event}/${option.id} -> ${effect.threadId}`]
            : [],
        ),
      );

    expect(dangling).toEqual([]);
  });
});

/*
 * Walking the map for real would mean winning five fights, which is a combat
 * test wearing a thread test's clothes. `enterNode` is where the clock lives,
 * so the walk goes through it and resets the screen between steps — that is the
 * whole of what a player entering a node does to a Thread.
 */
function stepInto(state: GameState, nodeId: string): GameState {
  const entered = enterNode(state, nodeId);
  if (entered.run === null) return entered;
  return { ...entered, run: { ...entered.run, screen: 'map', combat: null } };
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

    // Arriving lands first now, so the reprisal is announced on the way in
    // rather than sprung on a fight the player never saw coming.
    state = enterNode(state, targetId ?? '');
    expect(runOf(state).screen).toBe('landing');

    state = applyAction(state, { kind: 'leaveLanding' });
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
  it('stocks cards and exactly one removal', () => {
    const stocked = stockShop(fresh('SHOP'), 'n4_2');
    const shop = runOf(stocked).shop;
    expect(shop?.cards.length).toBeGreaterThan(0);
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
