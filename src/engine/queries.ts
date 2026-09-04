/* Read-only questions about the state.
 *
 * The UI computes nothing. When it needs a number it calls a function in here
 * — the same one the resolver calls. A screen that does its own arithmetic is
 * a screen that can disagree with the game, and a preview that can disagree
 * with the result is the fastest way to make a game feel unfair.
 */

import type { CardDef, EffectOp, GameState, RunState } from './types.ts';
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
/* ---------- what a card wants to know about its target ---------- */

/** A line on the target's health bar that a card cares about. */
export interface HullThreshold {
  /** Percentage of the target's maximum hull. */
  readonly pct: number;
  /** Which side of the line pays. */
  readonly side: 'below' | 'above';
}

/**
 * The target-health questions a card asks, if any.
 *
 * Twelve card entries read the target's hull as a PERCENTAGE — `Execute` below
 * 30%, `First Blood` above 70%, `Widening Gyre` two damage per 10% missing —
 * while the enemy readout says `28/28` and nothing else. The card asks in
 * percent and the board answers in hull, so the player is left converting units
 * mid-decision. That is not the arithmetic the game is about; it is a units
 * mismatch on screen.
 *
 * In the engine rather than in the component because the UI computes nothing:
 * this reads effect ops, which are game data, and a second implementation in a
 * renderer is a second thing that can disagree with the card.
 *
 * Walks into `conditional` and `scaleWith`, because that is where these live —
 * a threshold card is a `conditional` whose `when` is the question, and a slope
 * card is a `scaleWith` over `targetHullMissingPct`.
 */
export interface TargetHullInterest {
  /** Lines to mark on the bar. Empty for a card that reads the slope instead. */
  readonly thresholds: readonly HullThreshold[];
  /** True when the card scales on how much is missing, so every value matters. */
  readonly slope: boolean;
}

const NO_INTEREST: TargetHullInterest = { thresholds: [], slope: false };

export function targetHullInterest(def: CardDef): TargetHullInterest {
  const thresholds: HullThreshold[] = [];
  let slope = false;

  const walk = (ops: readonly EffectOp[]): void => {
    for (const op of ops) {
      if (op.op === 'conditional') {
        if (op.when.kind === 'targetHullBelowPct') {
          thresholds.push({ pct: op.when.value, side: 'below' });
        } else if (op.when.kind === 'targetHullAbovePct') {
          thresholds.push({ pct: op.when.value, side: 'above' });
        }
        walk(op.then);
        walk(op.else ?? []);
        continue;
      }
      if (op.op === 'scaleWith') {
        if (op.source === 'targetHullMissingPct') slope = true;
        walk(op.then);
        continue;
      }
      if (op.op === 'damage' && op.plusPer?.source === 'targetHullMissingPct') slope = true;
    }
  };

  walk(def.effects);
  if (thresholds.length === 0 && !slope) return NO_INTEREST;

  /* Deduplicated and ordered, so two ops asking the same question draw one
     line and the ticks read left to right. */
  const seen = new Set<string>();
  const unique = thresholds
    .filter((entry) => {
      const key = `${entry.side}:${entry.pct}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.pct - b.pct);

  return { thresholds: unique, slope };
}
