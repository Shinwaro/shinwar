/* Alloy.
 *
 * One pool, spent on both progression paths. Card removals, upgrades, ship
 * modules, hull repair and reactor capacity all come out of it, so every
 * purchase is "pilot or ship, now or later". That shared scarcity is the
 * mechanism that makes the dual-path structure generate decisions rather than
 * just doubling the reward stream.
 */

import type { GameState, RngState } from '../types.ts';
import { nextIntInclusive } from '../rng.ts';
import { appendLog, withRun } from '../state.ts';
import { ECONOMY } from '../../content/balance.ts';

export type Payout = 'combat' | 'elite' | 'boss';

export function rollAlloy(rng: RngState, payout: Payout): { value: number; rng: RngState } {
  const band =
    payout === 'boss'
      ? ECONOMY.alloyPerBoss
      : payout === 'elite'
        ? ECONOMY.alloyPerElite
        : ECONOMY.alloyPerCombat;
  return nextIntInclusive(rng, 'rewards', band.min, band.max);
}

export function gainAlloy(state: GameState, amount: number, source: string): GameState {
  if (amount <= 0) return state;
  const next = withRun(state, (run) => ({ ...run, alloy: run.alloy + amount }));
  return appendLog(next, {
    source,
    kind: 'reward',
    text: `Alloy +${amount} (${next.run?.alloy ?? 0}).`,
    detail: { amount },
  });
}

export function canAfford(state: GameState, cost: number): boolean {
  return (state.run?.alloy ?? 0) >= cost;
}

export function spendAlloy(state: GameState, amount: number, source: string): GameState {
  if (amount <= 0 || !canAfford(state, amount)) return state;
  const next = withRun(state, (run) => ({ ...run, alloy: run.alloy - amount }));
  return appendLog(next, {
    source,
    kind: 'reward',
    text: `Alloy -${amount} (${next.run?.alloy ?? 0}).`,
    detail: { amount: -amount },
  });
}

/** Rises per purchase, per Slay the Spire's model — it stops you removing your whole deck. */
export function removalCost(purchases: number): number {
  return ECONOMY.cardRemovalBase + ECONOMY.cardRemovalIncrement * purchases;
}
