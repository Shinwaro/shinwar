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
import { normalizeSeed, pick } from './rng.ts';
import { concludeCombat, endPlayerTurn, playCard, startCombat } from './combat/combat.ts';
import { encountersFor } from '../content/encounters.ts';
import { CLEAR_SPACE_ID } from '../content/environments.ts';
import { MAX_DEPTH } from '../content/balance.ts';

export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)));
}

/**
 * Open the run's first fight.
 *
 * At M1 there is no map, so the run is one encounter drawn from the Act 1
 * normal pool on the `map` stream — the same stream mapgen will use at M2, so
 * a seed keeps meaning roughly the same thing across the change. Act 1 node 1
 * is always a normal combat in Clear Space, and this is that node.
 */
function openFirstCombat(state: GameState): GameState {
  const run = state.run;
  if (run === null) return state;

  const pool = encountersFor(1, 'normal');
  const rolled = pick(run.rng, 'map', pool);
  const withRoll: GameState = { ...state, run: { ...run, rng: rolled.rng } };

  return startCombat(withRoll, rolled.value.id, CLEAR_SPACE_ID);
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
      const announced = appendLog(started, {
        source: 'system',
        kind: 'run',
        text: `Run started. Seed ${seed}, Depth ${depth}.`,
        detail: { seed, depth },
      });
      return openFirstCombat(announced);
    }

    case 'playCard': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return concludeCombat(playCard(state, action.cardUid, action.targetUid));
    }

    case 'endTurn': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return concludeCombat(endPlayerTurn(state));
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
