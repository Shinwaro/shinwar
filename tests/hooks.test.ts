/* The hook bus.
 *
 * Ordering is the whole test. Handlers must run by `priority`, then by a
 * stable `sourceId#key` — never by insertion order or object identity, because
 * that is determinism breaking in a way that takes a day to find.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { defineHook, fireHook, handlersFor, registerHooks, resetHooks } from '../src/engine/hooks.ts';
import { appendLog, createInitialState, requireRun } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';

/**
 * A state mid-run carrying the given hook sources, so their handlers are live.
 *
 * They ride as unresolved Threads. `activeHookSources` gates firing on what the
 * run is actually carrying, so a test that registers a handler also has to give
 * the run something that owns it — the kind of source hardly matters, only that
 * the bus can see it.
 */
function stateWithModules(sourceIds: readonly string[]): GameState {
  const started = applyAction(createInitialState('HOOKS'), { kind: 'beginRun' });
  const run = requireRun(started);
  return {
    ...started,
    log: [],
    run: {
      ...run,
      threads: sourceIds.map((threadId) => ({ threadId, resolved: false, progress: 0 })),
    },
  };
}

/** A handler that leaves a breadcrumb, so the firing order is readable afterwards. */
function marker(id: string) {
  return defineHook({
    hook: 'onTurnStart',
    priority: 0,
    handle: (state) => appendLog(state, { source: id, kind: 'debug', text: id, detail: null }),
  });
}

function order(state: GameState): string[] {
  return state.log.filter((entry) => entry.kind === 'debug').map((entry) => entry.text);
}

beforeEach(() => {
  resetHooks();
});

describe('ordering', () => {
  it('runs low priority first', () => {
    registerHooks('zulu_module', [{ ...marker('zulu'), priority: 10 }]);
    registerHooks('alpha_module', [{ ...marker('alpha'), priority: 20 }]);

    const fired = fireHook(stateWithModules(['alpha_module', 'zulu_module']), 'onTurnStart', { turn: 1 });
    expect(order(fired)).toEqual(['zulu', 'alpha']);
  });

  it('breaks ties by source id, not by registration order', () => {
    registerHooks('m_charlie', [marker('charlie')]);
    registerHooks('m_alpha', [marker('alpha')]);
    registerHooks('m_bravo', [marker('bravo')]);

    const installed = ['m_charlie', 'm_bravo', 'm_alpha'];
    const first = fireHook(stateWithModules(installed), 'onTurnStart', { turn: 1 });
    // Same sources, reversed in state: the outcome must not move.
    const second = fireHook(stateWithModules(installed.slice().reverse()), 'onTurnStart', { turn: 1 });

    expect(order(first)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(order(second)).toEqual(order(first));
  });

  it('separates two handlers from one source by their key', () => {
    registerHooks('twin_module', [
      { ...marker('second'), key: 'b' },
      { ...marker('first'), key: 'a' },
    ]);
    const fired = fireHook(stateWithModules(['twin_module']), 'onTurnStart', { turn: 1 });
    expect(order(fired)).toEqual(['first', 'second']);
  });

  it('refuses two handlers that would sort identically', () => {
    expect(() =>
      registerHooks('clash_module', [marker('one'), marker('two')]),
    ).toThrow(/distinct `key`/);
  });

  it('refuses to register a source twice', () => {
    registerHooks('once_module', [marker('once')]);
    expect(() => registerHooks('once_module', [marker('again')])).toThrow(/registered twice/);
  });
});

describe('activation', () => {
  it('ignores handlers whose source is not in play', () => {
    registerHooks('uninstalled_module', [marker('nope')]);
    const fired = fireHook(stateWithModules([]), 'onTurnStart', { turn: 1 });
    expect(order(fired)).toEqual([]);
  });

  it('does nothing at all outside a run', () => {
    registerHooks('any_module', [marker('nope')]);
    const title = createInitialState('IDLE');
    expect(fireHook(title, 'onTurnStart', { turn: 1 })).toBe(title);
  });

  it('leaves the state untouched when no handler changes it', () => {
    registerHooks('inert_module', [
      defineHook({ hook: 'onTurnStart', priority: 0, handle: (state) => state }),
    ]);
    const state = stateWithModules(['inert_module']);
    expect(fireHook(state, 'onTurnStart', { turn: 1 })).toBe(state);
  });
});

describe('logging', () => {
  it('records every handler that changed something', () => {
    registerHooks('loud_module', [marker('loud')]);
    const fired = fireHook(stateWithModules(['loud_module']), 'onTurnStart', { turn: 1 });
    const hookEntries = fired.log.filter((entry) => entry.kind === 'hook');
    expect(hookEntries).toHaveLength(1);
    expect(hookEntries[0]?.source).toBe('loud_module');
    expect(hookEntries[0]?.detail).toMatchObject({ hook: 'onTurnStart' });
  });
});

describe('recursion', () => {
  it('throws loudly rather than taking the tab with it', () => {
    registerHooks('cycle_module', [
      defineHook({
        hook: 'onTurnStart',
        priority: 0,
        handle: (state, payload) =>
          fireHook(appendLog(state, { source: 'cycle', kind: 'debug', text: 'x', detail: null }), 'onTurnStart', payload),
      }),
    ]);

    expect(() => fireHook(stateWithModules(['cycle_module']), 'onTurnStart', { turn: 1 })).toThrow(
      /recursion depth/,
    );
  });

  it('unwinds its depth counter after throwing', () => {
    registerHooks('cycle_module', [
      defineHook({
        hook: 'onTurnStart',
        priority: 0,
        handle: (state, payload) =>
          fireHook(appendLog(state, { source: 'cycle', kind: 'debug', text: 'x', detail: null }), 'onTurnStart', payload),
      }),
    ]);
    const state = stateWithModules(['cycle_module']);

    expect(() => fireHook(state, 'onTurnStart', { turn: 1 })).toThrow();
    // A second firing must fail the same way, not immediately on a stranded counter.
    expect(() => fireHook(state, 'onTurnStart', { turn: 1 })).toThrow(/recursion depth/);
  });
});

describe('inspection', () => {
  it('reports the registered handlers in firing order', () => {
    registerHooks('b_module', [{ ...marker('b'), priority: 5 }]);
    registerHooks('a_module', [{ ...marker('a'), priority: 9 }]);
    expect(handlersFor('onTurnStart')).toEqual([
      { sourceId: 'b_module', priority: 5 },
      { sourceId: 'a_module', priority: 9 },
    ]);
    expect(handlersFor('onCombatEnd')).toEqual([]);
  });
});
