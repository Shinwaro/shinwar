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
import { hasThread } from './threads.ts';
import { events as eventTable } from '../../content/registry.ts';

/** Which options this run may actually see. Thread-gated ones stay hidden. */
export function optionsFor(run: RunState, def: EventDef): readonly EventOption[] {
  return def.options.filter((option) => {
    const gate = option.requiresThread;
    return gate === undefined || hasThread(run, gate);
  });
}

function poolFor(run: RunState): readonly EventDef[] {
  const inAct = eventTable.all().filter((def) => def.acts === undefined || def.acts.includes(run.act));
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

  const logged = appendLog(state, {
    source: def.id,
    kind: 'run',
    text: `${def.name}: ${option.label}.`,
    detail: { event: def.id, option: option.id },
  });

  const applied = applyRunEffects(logged, option.effects, def.id);
  const lines = applied.lines.length > 0 ? applied.lines : ['Nothing changes. That was the point.'];

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
