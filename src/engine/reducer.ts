/* `applyAction(state, action) => newState`. The only way state changes.
 *
 * Pure and total: every action produces a state, and an action that makes no
 * sense in the current phase is ignored rather than throwing. The UI can then
 * dispatch optimistically, and — more importantly — a replayed action log
 * never explodes halfway through because one entry arrived out of order.
 */

import type { Action, ActionLog } from './actions.ts';
import type { GameState } from './types.ts';
import { appendLog, createInitialState, createRunState } from './state.ts';
import { normalizeSeed } from './rng.ts';
import { MAX_DEPTH } from '../content/balance.ts';

export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)));
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.kind) {
    case 'setSeed': {
      if (state.phase !== 'title') return state;
      return { ...state, title: { ...state.title, seed: normalizeSeed(action.seed) } };
    }

    case 'setDepth': {
      if (state.phase !== 'title') return state;
      return { ...state, title: { ...state.title, depth: clampDepth(action.depth) } };
    }

    case 'beginRun': {
      if (state.phase !== 'title') return state;
      const seed = normalizeSeed(state.title.seed);
      const depth = clampDepth(state.title.depth);
      const started: GameState = {
        ...state,
        phase: 'run',
        title: { seed, depth },
        run: createRunState(seed, depth),
        log: [],
      };
      return appendLog(started, {
        source: 'system',
        kind: 'run',
        text: `Run started. Seed ${seed}, Depth ${depth}.`,
        detail: { seed, depth },
      });
    }

    case 'abandonRun': {
      if (state.run === null || state.run.outcome !== null) return state;
      const abandoned: GameState = {
        ...state,
        phase: 'over',
        run: { ...state.run, outcome: 'abandoned' },
      };
      return appendLog(abandoned, {
        source: 'player',
        kind: 'run',
        text: 'Run abandoned.',
        detail: null,
      });
    }

    case 'returnToTitle': {
      // Deliberately a fresh state rather than a reset: nothing from the
      // finished run should be able to leak into the next one.
      const seed = state.run === null ? state.title.seed : state.run.seed;
      return createInitialState(seed, state.title.depth);
    }

    default: {
      // Exhaustiveness. If this stops compiling, an action has no case.
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Fold a list of actions. The shape replay (M2) and the simulator both use. */
export function applyActions(state: GameState, actions: readonly Action[]): GameState {
  return actions.reduce<GameState>(applyAction, state);
}

/**
 * Rebuild a run from its log. The regression harness, the simulator's repro
 * path, and the answer to any bug report that arrives with a seed.
 */
export function replay(log: ActionLog): GameState {
  const base = createInitialState(log.seed, log.depth);
  return applyActions(base, log.actions);
}
