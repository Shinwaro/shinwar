/* Anomalies.
 *
 * Every event is a specific named situation with three real options that answer
 * different needs — power, economy, safety, information — plus a "leave" that
 * is always available and always genuinely worthless. The worthless option is
 * what makes the other three read as decisions rather than a slot machine you
 * are forced to pull. The registry validator enforces both halves.
 *
 * Two beats, deliberately: choose, then read what it cost. Resolving straight
 * back to the map would bury the consequence in the log, and a consequence the
 * player does not connect to their choice may as well have been random.
 */

import type { EventDef, EventOption, GameState, RunState } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { weightedPick } from '../rng.ts';
import { applyRunEffects } from './effects.ts';
import { activeThreads, hasThread } from './threads.ts';
import { events as eventTable, threads as threadTable } from '../../content/registry.ts';
import { THREADS } from '../../content/balance.ts';

/** Which options this run may actually see. Thread-gated ones stay hidden. */
export function optionsFor(run: RunState, def: EventDef): readonly EventOption[] {
  return def.options.filter((option) => {
    const gate = option.requiresThread;
    return gate === undefined || hasThread(run, gate);
  });
}

/**
 * Why this option cannot be taken, or `null` if it can.
 *
 * An event never kills you, so costs floor at 1 — which quietly turned a big
 * price into a free one the moment you were low enough. "Lose 12 health" with 2
 * left cost two points and read as a bargain. Refusing the option keeps both
 * halves honest: the floor still holds, and the price is still a price.
 */
export function refusalFor(run: RunState, option: EventOption): string | null {
  for (const effect of option.effects) {
    if (effect.op === 'alloy' && effect.amount < 0 && run.alloy < -effect.amount) {
      return `You have ${run.alloy} Alloy. This asks ${-effect.amount}.`;
    }
    if (effect.op === 'health' && effect.amount < 0 && run.pilot.health <= -effect.amount) {
      return `This asks ${-effect.amount} health. You have ${run.pilot.health}.`;
    }
    if (effect.op === 'maxHealth' && effect.amount < 0 && run.pilot.maxHealth <= -effect.amount) {
      return 'There is not enough of you left to give.';
    }
    /*
     * A Thread you are already carrying.
     *
     * `canSetThread` refuses a duplicate, so this option used to be takeable and
     * then quietly do nothing — the worst of the three outcomes, because the
     * player has spent the choice and has no way to know it was spent on air.
     * Refusing it up front costs nothing and says why; a second copy of the same
     * promise would need a second countdown, and the Manifest has one row per
     * Thread.
     */
    if (effect.op === 'setThread') {
      const def = threadTable.find(effect.threadId);
      const already = run.threads.some(
        (carried) => carried.threadId === effect.threadId && !carried.resolved,
      );
      if (already) return `You are already carrying ${def?.name ?? 'that'}.`;
      if (activeThreads(run).length >= THREADS.maxActive) {
        return 'You are carrying all you can keep track of.';
      }
    }
  }
  return null;
}

export function canTakeOption(run: RunState, option: EventOption): boolean {
  return refusalFor(run, option) === null;
}

function poolFor(run: RunState): readonly EventDef[] {
  const inAct = eventTable
    .all()
    .filter((def) => def.pinnedOnly !== true)
    .filter((def) => def.acts === undefined || def.acts.includes(run.act));
  const unseen = inAct.filter((def) => !run.seenEvents.includes(def.id));
  // A repeat beats a node that does nothing. Only reachable once the pool is
  // exhausted, which at 10 events means a very long act.
  return unseen.length > 0 ? unseen : inAct;
}

/**
 * Roll an Anomaly and put it on screen. Flat weights: the pool is small enough
 * that "you have not seen this one yet" is the only weighting that matters.
 */
export function openEvent(state: GameState): GameState {
  const run = requireRun(state);

  /* A node that names its own Anomaly gets that one, without touching the
     events stream — the Reliquary has to be where the map says it is, and
     rolling for it would put the whole point of Act 2 behind a die. */
  const here = run.map?.nodes.find((node) => node.id === run.position) ?? null;
  const pinned = here?.eventId ?? null;
  if (pinned !== null && eventTable.has(pinned)) {
    const opened = withRun(state, (current) => ({
      ...current,
      seenEvents: current.seenEvents.includes(pinned)
        ? current.seenEvents
        : [...current.seenEvents, pinned],
      pendingEvent: { eventId: pinned, chosenOptionId: null, outcome: [] },
      screen: 'event',
    }));
    return appendLog(opened, {
      source: 'anomaly',
      kind: 'run',
      text: eventTable.get(pinned).name,
      detail: { event: pinned, pinned: true },
    });
  }

  const pool = poolFor(run);

  if (pool.length === 0) {
    return appendLog(withRun(state, (current) => ({ ...current, screen: 'map' })), {
      source: 'anomaly',
      kind: 'run',
      text: 'The anomaly reads as empty space. Nothing here.',
      detail: null,
    });
  }

  const rolled = weightedPick(
    run.rng,
    'events',
    pool.map((def) => ({ value: def.id, weight: 1 })),
  );

  const next = withRun(state, (current) => ({
    ...current,
    rng: rolled.rng,
    seenEvents: current.seenEvents.includes(rolled.value)
      ? current.seenEvents
      : [...current.seenEvents, rolled.value],
    pendingEvent: { eventId: rolled.value, chosenOptionId: null, outcome: [] },
    screen: 'event',
  }));

  return appendLog(next, {
    source: 'anomaly',
    kind: 'run',
    text: eventTable.get(rolled.value).name,
    detail: { event: rolled.value },
  });
}

/** Commit to an option. Its effects resolve now; the screen shows what they were. */
export function chooseEventOption(state: GameState, optionId: string): GameState {
  const run = requireRun(state);
  const pending = run.pendingEvent;
  if (pending === null || pending.chosenOptionId !== null) return state;

  const def = eventTable.find(pending.eventId);
  if (def === undefined) return state;

  const option = optionsFor(run, def).find((entry) => entry.id === optionId);
  if (option === undefined) return state;
  // Enforced here, not only in the UI: the reducer is the rule, the screen is
  // the presentation of it.
  if (!canTakeOption(run, option)) return state;

  const logged = appendLog(state, {
    source: def.id,
    kind: 'run',
    text: `${def.name}: ${option.label}.`,
    detail: { event: def.id, option: option.id },
  });

  const applied = applyRunEffects(logged, option.effects, def.id);
  const lines =
    applied.lines.length > 0
      ? applied.lines
      : [{ text: 'Nothing changes. That was the point.' }];

  return withRun(applied.state, (current) => ({
    ...current,
    pendingEvent:
      current.pendingEvent === null
        ? null
        : { ...current.pendingEvent, chosenOptionId: option.id, outcome: lines },
  }));
}

/**
 * Close the Anomaly. Normally back to the map — unless something on it decided
 * the node was already occupied, in which case the caller opens that fight.
 */
export function clearEvent(state: GameState): GameState {
  return withRun(state, (current) => ({ ...current, pendingEvent: null, screen: 'map' }));
}
