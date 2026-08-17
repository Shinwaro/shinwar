/* Read-only questions about the state.
 *
 * The UI computes nothing. When it needs a number it calls a function in here
 * — the same one the resolver calls. A screen that does its own arithmetic is
 * a screen that can disagree with the game, and a preview that can disagree
 * with the result is the fastest way to make a game feel unfair.
 */

import type { GameState, RunState } from './types.ts';
import type { DepthRule } from '../content/balance.ts';
import { DEPTH_RULES, MAX_DEPTH } from '../content/balance.ts';

/* ---------- seed and depth ---------- */

/** The seed in force: the run's if one is live, otherwise the title draft. */
export function currentSeed(state: GameState): string {
  return state.run?.seed ?? state.title.seed;
}

export function currentDepth(state: GameState): number {
  return state.run?.depth ?? state.title.depth;
}

/** Every rule in force at this depth. Depth 0 has none. */
export function depthRules(depth: number): readonly DepthRule[] {
  const clamped = Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)));
  return DEPTH_RULES.filter((rule) => rule.depth <= clamped);
}

/** Rules that exist but have no text yet — the title screen says so rather than lying. */
export function undefinedDepthRuleCount(depth: number): number {
  return depthRules(depth).filter((rule) => rule.text === null).length;
}

/* ---------- run ---------- */

export function activeRun(state: GameState): RunState | null {
  if (state.run === null || state.run.outcome !== null) return null;
  return state.run;
}

/**
 * Whether to arm the `beforeunload` guard. One of the two mitigations for
 * having no saves — the other is the seed being copyable everywhere.
 */
export function shouldGuardUnload(state: GameState): boolean {
  return activeRun(state) !== null;
}

/** The ronin's own health, spent in combat on foot. */
export function healthFraction(run: RunState): number {
  if (run.pilot.maxHealth <= 0) return 0;
  return Math.max(0, Math.min(1, run.pilot.health / run.pilot.maxHealth));
}

