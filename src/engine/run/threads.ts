/* Threads — the story engine.
 *
 * A Thread is a persistent run-scoped flag that comes due later in the same
 * run. It is the cheapest mechanism there is for producing a run you remember,
 * and it is the thing most small roguelikes skip.
 *
 * Three rules from DESIGN.md §4, all enforced here or by the content validator:
 *
 *   - Threads always resolve within the same run. Cross-run consequences sound
 *     good and read as arbitrary.
 *   - At most `THREADS.maxActive` unresolved at once. More than four and none
 *     of them land.
 *   - The player can always see what they are carrying. That is the Manifest,
 *     and it is why `ThreadDef.description` and `.omen` are not optional.
 *
 * This file deliberately does NOT apply payoffs. It reports which threads have
 * come due and the caller applies their effects — otherwise `threads.ts` and
 * `effects.ts` import each other, and a cycle between two files that both run
 * at module load is a bug waiting for a refactor to find it.
 */

import type { GameState, RunState, ThreadDef, ThreadId, ThreadState } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { THREADS } from '../../content/balance.ts';
import { threads as threadTable } from '../../content/registry.ts';

/* ---------- reading ---------- */

export function threadState(run: RunState, threadId: ThreadId): ThreadState | undefined {
  return run.threads.find((entry) => entry.threadId === threadId);
}

export function hasThread(run: RunState, threadId: ThreadId): boolean {
  return threadState(run, threadId) !== undefined;
}

/** Carried and not yet come due. What the Manifest lists. */
export function activeThreads(run: RunState): readonly ThreadState[] {
  return run.threads.filter((entry) => !entry.resolved);
}

export function canSetThread(run: RunState, threadId: ThreadId): boolean {
  if (hasThread(run, threadId)) return false;
  if (!threadTable.has(threadId)) return false;
  return activeThreads(run).length < THREADS.maxActive;
}

/* ---------- setting ---------- */

/** Take one on. The omen names the category of what is coming, never the payoff. */
export function setThread(state: GameState, threadId: ThreadId): GameState {
  const run = requireRun(state);
  if (!canSetThread(run, threadId)) return state;
  const def = threadTable.get(threadId);

  let next = withRun(state, (current) => ({
    ...current,
    threads: [...current.threads, { threadId, resolved: false, progress: 0 }],
  }));

  next = appendLog(next, {
    source: threadId,
    kind: 'thread',
    text: `${def.name}. ${def.omen}`,
    detail: { thread: threadId, tone: def.tone },
  });

  return fireHook(next, 'onThreadSet', { threadId });
}

/* ---------- resolving ---------- */

/** Mark it done. The payoff itself is the caller's business. */
export function resolveThread(state: GameState, threadId: ThreadId): GameState {
  const run = requireRun(state);
  const entry = threadState(run, threadId);
  if (entry === undefined || entry.resolved) return state;
  const def = threadTable.get(threadId);

  let next = withRun(state, (current) => ({
    ...current,
    threads: current.threads.map((thread) =>
      thread.threadId === threadId ? { ...thread, resolved: true } : thread,
    ),
  }));

  next = appendLog(next, {
    source: threadId,
    kind: 'thread',
    text: `${def.name} comes due.`,
    detail: { thread: threadId },
  });

  return fireHook(next, 'onThreadResolved', { threadId });
}

/* ---------- the clock ---------- */

/** One node entered. Every unresolved thread moves one step closer. */
export function advanceThreads(state: GameState): GameState {
  const run = requireRun(state);
  if (activeThreads(run).length === 0) return state;
  return withRun(state, (current) => ({
    ...current,
    threads: current.threads.map((thread) =>
      thread.resolved ? thread : { ...thread, progress: thread.progress + 1 },
    ),
  }));
}

/**
 * Which threads have come due, in registry order so two threads landing on the
 * same node always resolve in the same sequence for a seed.
 */
export function dueThreads(run: RunState): readonly ThreadDef[] {
  const due: ThreadDef[] = [];
  for (const def of threadTable.all()) {
    const entry = threadState(run, def.id);
    if (entry === undefined || entry.resolved) continue;
    if (entry.progress >= def.trigger.count) due.push(def);
  }
  return due;
}
