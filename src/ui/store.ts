/* The one place the UI holds state.
 *
 * The store owns a `GameState` and the action log that produced it. It does no
 * game logic of its own — every change goes through `applyAction`, and every
 * action is recorded, so `seed + action log` reproduces the run exactly. That
 * is the regression harness, the simulator's repro path, and the bug report
 * format, all from the same recording.
 *
 * Nothing here is persisted. The log lives in memory and dies with the tab.
 */

import type { Action, ActionLog } from '../engine/actions.ts';
import type { GameState } from '../engine/types.ts';
import { applyAction } from '../engine/reducer.ts';

export type Listener = (state: GameState) => void;

export interface Store {
  getState(): GameState;
  /** The recording so far. Feed it to `replay()` and the same state comes back. */
  getActionLog(): ActionLog;
  dispatch(action: Action): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: GameState): Store {
  let state = initial;
  const actions: Action[] = [];
  const listeners = new Set<Listener>();

  return {
    getState() {
      return state;
    },

    getActionLog() {
      return {
        seed: initial.title.seed,
        depth: initial.title.depth,
        actions: actions.slice(),
      };
    },

    dispatch(action) {
      const next = applyAction(state, action);
      actions.push(action);
      // An action the reducer chose to ignore still belongs in the log — the
      // log is a record of what was dispatched, and replay must see the same
      // sequence or it is not a replay.
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
