/* The hook bus.
 *
 * Pure deterministic pub/sub. Ship modules, statuses, masteries, environments
 * and card powers all subscribe here, which is what makes synergy emergent
 * instead of special-cased. Once this exists, a ship module is *just* data
 * plus a handler; so is a mastery, a status, an environment. That uniformity
 * is the entire point of the architecture.
 *
 * Three rules:
 *
 *   - Handlers are pure `(state, payload) => state`. No side effects, ever.
 *   - Ordering is by `priority`, then by a stable `sourceId#key` string.
 *     NEVER by insertion order or object identity — that is how determinism
 *     breaks in ways that take a day to find.
 *   - A handler that changes state leaves a log line. Silent state changes are
 *     the thing the combat log exists to prevent.
 *
 * The registry itself is module-level, not part of `GameState`, because
 * functions cannot live in serializable state. Which handlers are *active* is
 * derived from state — see `activeHookSources`.
 */

import type { GameState, JsonValue, StatusId } from './types.ts';
import { appendLog } from './state.ts';

/* ---------- the hooks ----------
   `HookName` is derived from this map so a hook can never exist without a
   declared payload shape. */

export interface HookPayloads {
  onCombatStart: { readonly encounterId: string; readonly environmentId: string };
  onCombatEnd: { readonly outcome: 'won' | 'lost' };

  onTurnStart: { readonly turn: number };
  onTurnEnd: { readonly turn: number };
  onRoundStart: { readonly round: number };
  onRoundEnd: { readonly round: number };

  onCardPlayed: { readonly cardUid: string; readonly cardId: string };
  onCardDrawn: { readonly cardUid: string; readonly cardId: string };
  onCardExhausted: { readonly cardUid: string; readonly cardId: string };

  onStanceChange: { readonly from: string; readonly to: string };

  onHeatGained: { readonly amount: number; readonly total: number };
  onHeatVented: { readonly amount: number; readonly total: number };
  onOverheat: { readonly heat: number; readonly damage: number };

  onDamageDealt: { readonly targetUid: string; readonly amount: number; readonly source: string };
  onDamageTaken: { readonly amount: number; readonly source: string };
  onBlockGained: { readonly amount: number };

  onEnemyKilled: { readonly enemyUid: string; readonly enemyId: string };
  onPlayerDeath: { readonly source: string };

  onNodeEntered: { readonly nodeId: string; readonly nodeType: string };
  onRewardOffered: { readonly cardIds: readonly string[] };
  onShopStocked: { readonly nodeId: string };

  onThreadSet: { readonly threadId: string };
  onThreadResolved: { readonly threadId: string };
}

export type HookName = keyof HookPayloads;

export interface HookRegistration<N extends HookName> {
  readonly hook: N;
  /** Lower runs first. Defaults live in `content/balance.ts`. */
  readonly priority: number;
  /**
   * Distinguishes two handlers on the same hook from the same source. Only
   * needed in that case, but it must be stable — it is part of the sort key.
   */
  readonly key?: string;
  readonly handle: (state: GameState, payload: HookPayloads[N]) => GameState;
}

/**
 * A registration for *some* hook. Distributed over the union so each member
 * keeps its own payload type — `HookRegistration<HookName>` would widen the
 * payload to the union of all of them and reject every concrete handler.
 */
export type AnyHookRegistration = { [N in HookName]: HookRegistration<N> }[HookName];

/** Sugar for content files: keeps the payload inferred at the call site. */
export function defineHook<N extends HookName>(registration: HookRegistration<N>): AnyHookRegistration {
  return registration as unknown as AnyHookRegistration;
}

/* ---------- registry ---------- */

interface StoredHandler {
  readonly sourceId: string;
  readonly hook: HookName;
  readonly priority: number;
  readonly sortKey: string;
  // The payload type is checked at the `register` boundary; inside the store
  // the handlers are heterogeneous, so this is the one place that erases it.
  readonly handle: (state: GameState, payload: never) => GameState;
}

const registry = new Map<HookName, StoredHandler[]>();
const registeredSources = new Set<string>();

/**
 * Subscribe a content source to the bus. Called once at module load, from
 * `src/content/`, never from the UI and never mid-run.
 */
export function registerHooks(sourceId: string, registrations: readonly AnyHookRegistration[]): void {
  if (registeredSources.has(sourceId)) {
    throw new Error(`hooks: '${sourceId}' registered twice`);
  }
  registeredSources.add(sourceId);

  for (const registration of registrations) {
    const sortKey = `${sourceId}#${registration.key ?? ''}`;
    const bucket = registry.get(registration.hook) ?? [];

    const clash = bucket.find(
      (existing) => existing.sortKey === sortKey && existing.priority === registration.priority,
    );
    if (clash !== undefined) {
      throw new Error(
        `hooks: '${sourceId}' has two handlers for '${registration.hook}' at priority ` +
          `${registration.priority} with the same key. Give one of them a distinct \`key\`.`,
      );
    }

    bucket.push({
      sourceId,
      hook: registration.hook,
      priority: registration.priority,
      sortKey,
      handle: registration.handle as unknown as (state: GameState, payload: never) => GameState,
    });
    registry.set(registration.hook, bucket);
  }
}

/** Wipes the bus. Tests only — the game registers once at load and never unregisters. */
export function resetHooks(): void {
  registry.clear();
  registeredSources.clear();
}

export function isRegistered(sourceId: string): boolean {
  return registeredSources.has(sourceId);
}

/* ---------- activation ----------
   A handler runs only when its source is present in the current state. This is
   the join between "content declares behaviour" and "state decides what is on
   the ship right now". */

function collectStatusIds(statuses: readonly { readonly status: StatusId }[]): string[] {
  return statuses.map((entry) => entry.status);
}

/**
 * Every source id whose handlers are live for this state: installed modules,
 * the current environment, earned masteries, unresolved threads, and every
 * status in play on either side.
 */
export function activeHookSources(state: GameState): readonly string[] {
  const run = state.run;
  if (run === null) return [];

  const sources: string[] = [];

  for (const installed of run.ship.installed) sources.push(installed.moduleId);
  for (const masteryId of run.pilot.masteries) sources.push(masteryId);
  for (const thread of run.threads) {
    if (!thread.resolved) sources.push(thread.threadId);
  }

  const combat = run.combat;
  if (combat !== null) {
    sources.push(combat.environmentId);
    sources.push(...collectStatusIds(combat.statuses));
    for (const enemy of combat.enemies) {
      sources.push(...collectStatusIds(enemy.statuses));
      sources.push(enemy.defId);
    }
  }

  return sources;
}

/* ---------- firing ---------- */

/**
 * A handler that fires a hook, whose handler fires a hook, and so on. Legal to
 * a point — that is how a module reacting to a vent can itself cause a vent —
 * but a cycle is a content bug, and an unbounded one takes the tab with it.
 */
const MAX_HOOK_DEPTH = 16;
let depth = 0;

/** Test hatch: the depth counter is module-level, so a thrown hook could strand it. */
export function resetHookDepth(): void {
  depth = 0;
}

function sortHandlers(handlers: readonly StoredHandler[]): StoredHandler[] {
  return handlers.slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
  });
}

/**
 * Fire a hook. Folds every active handler over the state in deterministic
 * order and returns the result. Handlers that change nothing cost nothing.
 */
export function fireHook<N extends HookName>(
  state: GameState,
  hook: N,
  payload: HookPayloads[N],
): GameState {
  const bucket = registry.get(hook);
  if (bucket === undefined || bucket.length === 0) return state;

  const active = new Set(activeHookSources(state));
  if (active.size === 0) return state;

  const runnable = sortHandlers(bucket.filter((handler) => active.has(handler.sourceId)));
  if (runnable.length === 0) return state;

  if (depth >= MAX_HOOK_DEPTH) {
    throw new Error(
      `hooks: recursion depth ${MAX_HOOK_DEPTH} exceeded firing '${hook}'. ` +
        `A handler is re-entering its own hook — check the sources involved.`,
    );
  }

  depth += 1;
  try {
    let next = state;
    for (const handler of runnable) {
      const before = next;
      const after = handler.handle(before, payload as never);
      if (after === before) continue;
      next = appendLog(after, {
        source: handler.sourceId,
        kind: 'hook',
        text: `${handler.sourceId} responded to ${hook}`,
        detail: { hook, payload: payload as unknown as JsonValue },
      });
    }
    return next;
  } finally {
    depth -= 1;
  }
}

/** Inspection for tests and the content validator. Never used to drive the game. */
export function handlersFor(hook: HookName): readonly { sourceId: string; priority: number }[] {
  const bucket = registry.get(hook) ?? [];
  return sortHandlers(bucket).map((handler) => ({
    sourceId: handler.sourceId,
    priority: handler.priority,
  }));
}
