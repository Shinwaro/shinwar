/* State construction and the small pure helpers everything else builds on.
 *
 * Pure. No DOM, no clock, no randomness beyond the seeded streams in `rng.ts`.
 * Every function returns a new object; nothing here mutates its argument.
 */

import type { CombatState, GameState, LogEntry, RunState, TitleState } from './types.ts';
import { createRng } from './rng.ts';
import { buildDeck } from './combat/instances.ts';
import { PLAYER, RELIC_COMBAT_PITY } from '../content/balance.ts';
import { TUTORIAL_DECK } from '../content/tutorial.ts';
import { STARTING_DECK } from '../content/cards/index.ts';

/** Bumped when the shape of `GameState` changes, so a pasted dump identifies itself. */
export const SCHEMA_VERSION = 1;

/**
 * The log is a rolling window, not an archive. `seed + action log` is the
 * source of truth for reproducing a run; this is the readable narration on top
 * of it, and an hour-long run should not grow it without bound.
 */
export const LOG_LIMIT = 4000;

export const DEFAULT_TITLE: TitleState = { seed: 'SHINWAR', depth: 0 };

/* ---------- construction ---------- */

/**
 * The state the game boots into: the title screen, nothing running. The UI
 * supplies the default seed because the engine has no entropy of its own.
 */
export function createInitialState(seed: string, depth = 0): GameState {
  return {
    schema: SCHEMA_VERSION,
    phase: 'title',
    title: { seed, depth },
    run: null,
    log: [],
  };
}

/**
 * A fresh run. Everything derives from the seed and the depth — hand these two
 * numbers to this function anywhere and you get the identical run.
 */
export function createRunState(seed: string, depth: number): RunState {
  const built = buildDeck(0, STARTING_DECK);
  return {
    seed,
    depth,
    rng: createRng(seed),
    act: 1,
    map: null,
    position: null,
    visited: [],
    screen: 'map',
    pendingReward: null,
    alloy: PLAYER.startingAlloy,
    pilot: {
      health: PLAYER.maxHealth,
      maxHealth: PLAYER.maxHealth,
      deck: built.deck,
      masteries: [],
      relics: [],
      implants: [],
    },
    threads: [],
    pendingEvent: null,
    landing: null,
    seenEvents: [],
    shop: null,
    forcedTier: null,
    ambushOwes: null,
    /* Starts AT neutral, not at zero.

       The curve reads this as "fights since the last drop", and zero now means
       "one just landed" — which would open every run two fights below the base
       rate as a penalty for a relic nobody received. Neutral is the honest
       starting position: no history either way. */
    combatRelicDry: RELIC_COMBAT_PITY.neutral,
    combatRelicsFound: 0,
    // Act 1 has no front. `openMap` sets it when the act that does begins.
    wavefront: null,
    combat: null,
    outcome: null,
    uidCounter: built.uidCounter,
    removalsPurchased: 0,
    tutorial: false,
  };
}

/**
 * The introduction: one fight, a fixed strong deck, no chart.
 *
 * A real `RunState` on purpose. Teaching with a special case would mean the
 * lesson and the game could drift, and the first thing a new player would
 * learn is something that is not true any more.
 */
export function createTutorialRunState(seed: string): RunState {
  const built = buildDeck(0, TUTORIAL_DECK);
  const base = createRunState(seed, 0);
  return {
    ...base,
    screen: 'combat',
    tutorial: true,
    pilot: { ...base.pilot, deck: built.deck },
    uidCounter: built.uidCounter,
  };
}

/* ---------- the log ----------
   Every transition appends one of these. Never let damage happen without a
   log line: it is the debugger and the player's answer to "why did I take 19
   damage" at the same time. */

export type LogInput = Omit<LogEntry, 'turn' | 'round'>;

/** Turn and round come from the combat in progress, or 0 outside one. */
function logCoordinates(state: GameState): { turn: number; round: number } {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return { turn: 0, round: 0 };
  return { turn: combat.turn, round: combat.round };
}

export function appendLog(state: GameState, entry: LogInput): GameState {
  const { turn, round } = logCoordinates(state);
  const next: LogEntry = { turn, round, ...entry };
  const log = state.log.length >= LOG_LIMIT ? [...state.log.slice(1 - LOG_LIMIT), next] : [...state.log, next];
  return { ...state, log };
}

export function appendLogs(state: GameState, entries: readonly LogInput[]): GameState {
  return entries.reduce<GameState>((acc, entry) => appendLog(acc, entry), state);
}

/* ---------- run helpers ----------
   `state.run` is nullable, and reaching through it is the single most common
   thing every other engine file does. These keep that from becoming a forest
   of null checks with subtly different behaviour. */

/** Throws rather than returning null — callers inside a run have already checked the phase. */
export function requireRun(state: GameState): RunState {
  if (state.run === null) throw new Error('engine: expected an active run, found none');
  return state.run;
}

export function withRun(state: GameState, update: (run: RunState) => RunState): GameState {
  const run = requireRun(state);
  return { ...state, run: update(run) };
}

export function isRunActive(state: GameState): boolean {
  return state.phase === 'run' && state.run !== null && state.run.outcome === null;
}

/* ---------- combat helpers ----------
   Same argument as above, one level deeper. Everything under `combat/` reaches
   through these rather than re-deriving the null checks. */

export function activeCombat(state: GameState): CombatState | null {
  return state.run?.combat ?? null;
}

export function requireCombat(state: GameState): CombatState {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) {
    throw new Error('engine: expected a combat in progress, found none');
  }
  return combat;
}

export function withCombat(
  state: GameState,
  update: (combat: CombatState) => CombatState,
): GameState {
  const combat = requireCombat(state);
  return withRun(state, (run) => ({ ...run, combat: update(combat) }));
}
