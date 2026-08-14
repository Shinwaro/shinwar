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
  // Keep the list sorted so the order never depends on application order.
  return [...without, { status, stacks: next }].sort((a, b) =>
    a.status < b.status ? -1 : a.status > b.status ? 1 : 0,
  );
}

/** One stack off every `decay: 'turn'` status. Runs at the end of the holder's turn. */
export function decayStatuses(held: readonly StatusStack[]): readonly StatusStack[] {
  let out = held;
  for (const entry of held) {
    if (statusTable.find(entry.status)?.decay === 'turn') {
      out = addStacks(out, entry.status, -1);
    }
  }
  return out;
}

export function describeStatus(status: StatusId, stacks: number): string {
  const def = statusTable.find(status);
  return `${def?.name ?? status} ${stacks}`;
}
