/* Status stack arithmetic.
 *
 * What a status *does* lives in `src/content/statuses.ts` and is read by the
 * damage pipeline. What lives here is only the bookkeeping: add, read, decay.
 */

import type { StatusStack, StatusId } from '../types.ts';
import { statuses as statusTable } from '../../content/registry.ts';

export function stacksOf(held: readonly StatusStack[], status: StatusId): number {
  return held.find((entry) => entry.status === status)?.stacks ?? 0;
}

export function hasStatus(held: readonly StatusStack[], status: StatusId): boolean {
  return stacksOf(held, status) > 0;
}

/**
 * Add stacks, or subtract them. A status at zero or below is removed entirely
 * rather than left as an empty row — an empty row would serialize, and two
 * states that differ only by an invisible zero would hash differently.
 */
export function addStacks(
  held: readonly StatusStack[],
  status: StatusId,
  delta: number,
): readonly StatusStack[] {
  if (delta === 0) return held;
  const existing = stacksOf(held, status);
  const next = existing + delta;
  const without = held.filter((entry) => entry.status !== status);
  if (next <= 0) return without;

  // Gaining stacks marks the whole entry fresh, so the coming decay skips it
  // once. Losing them never does — a decay must not refresh its own target.
  const wasFresh = held.find((entry) => entry.status === status)?.fresh ?? false;
  const fresh = delta > 0 ? true : wasFresh;

  // Keep the list sorted so the order never depends on application order.
  return [...without, { status, stacks: next, fresh }].sort((a, b) =>
    a.status < b.status ? -1 : a.status > b.status ? 1 : 0,
  );
}

/**
 * One stack off every `decay: 'turn'` status — except the ones applied since
 * their holder last acted.
 *
 * That exception is the whole reason `fresh` exists. Decay runs at the end of
 * the round, after the enemies have moved, so without it a debuff an enemy just
 * applied to the player is stripped in the same breath: applied, logged, and
 * gone before the player takes a single turn under it. Every enemy debuff in
 * the game was doing nothing at all.
 */
export function decayStatuses(held: readonly StatusStack[]): readonly StatusStack[] {
  let out = held;
  for (const entry of held) {
    if (entry.fresh) continue;
    if (statusTable.find(entry.status)?.decay === 'turn') {
      out = addStacks(out, entry.status, -1);
    }
  }
  return out;
}

/**
 * The holder is acting, so nothing on them is new any more.
 *
 * Called at the start of the player's turn and when an enemy takes its action —
 * the two moments that mean "you have now had a turn with this".
 */
export function clearFresh(held: readonly StatusStack[]): readonly StatusStack[] {
  if (!held.some((entry) => entry.fresh)) return held;
  return held.map((entry) => (entry.fresh ? { ...entry, fresh: false } : entry));
}

export function describeStatus(status: StatusId, stacks: number): string {
  const def = statusTable.find(status);
  return `${def?.name ?? status} ${stacks}`;
}
