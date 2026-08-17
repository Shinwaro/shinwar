/* The Anomaly screen.
 *
 * Two beats. Read the situation and choose; read what it cost and move on.
 * Resolving straight back to the map would bury the consequence in the log, and
 * a consequence the player does not connect to their choice may as well have
 * been random.
 *
 * Every option states exactly what it does now. Where the consequence is
 * deferred, the RISK and PAYOFF chips name the category — that is the
 * information split from DESIGN.md §6: the player is never asked to guess at
 * something they could have computed, and never told the ending in advance.
 */

import type { EventOption, GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { optionsFor } from '../../engine/run/events.ts';
import { describeRunEffects } from '../../engine/run/describe.ts';
import { events as eventTable } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { renderRunBar } from '../components/runbar.ts';
import { renderManifest } from '../components/manifest.ts';

export function renderEvent(store: Store): HTMLElement {
  return liveScreen(store, 'anomaly screen', (state) => {
    if (state.run === null || state.run.screen !== 'event') return null;
    return build(store, state);
  });
}

function build(store: Store, state: GameState): HTMLElement | null {
  const run = requireRun(state);
  const pending = run.pendingEvent;
  if (pending === null) return null;

  const def = eventTable.find(pending.eventId);
  if (def === undefined) return null;

  const options = optionsFor(run, def);
  const chosen = options.find((entry) => entry.id === pending.chosenOptionId) ?? null;

  return el('div', { class: 'anomaly-inner' }, [
    renderRunBar(store, state),
    el('h1', { class: 'screen-title' }, [def.name]),
    el('p', { class: 'anomaly-body' }, [def.body]),
    renderManifest(state),

    chosen === null
      ? el('div', { class: 'anomaly-options' }, options.map((option) => renderOption(store, option)))
      : renderOutcome(store, chosen, pending.outcome),
  ]);
}

function renderOption(store: Store, option: EventOption): HTMLElement {
  const mechanics = describeRunEffects(option.effects);

  const node = button(
    '',
    { class: `anomaly-option${option.isLeave === true ? ' anomaly-option--leave' : ''}` },
    () => store.dispatch({ kind: 'chooseEventOption', optionId: option.id }),
  );

  node.replaceChildren(
    el('span', { class: 'anomaly-option-label' }, [option.label]),
    el('span', { class: 'anomaly-option-detail' }, [option.detail]),
    // Generated from the effects, never hand-written, so it cannot drift from
    // what the option actually does.
    mechanics === ''
      ? el('span', { class: 'anomaly-option-effect is-nothing' }, ['Nothing happens'])
      : el('span', { class: 'anomaly-option-effect' }, [mechanics]),
    el('span', { class: 'anomaly-chips' }, [
      chip('RISK', option.risk),
      chip('PAYOFF', option.payoff),
    ]),
  );

  return node;
}

function chip(label: string, value: string): HTMLElement {
  return el('span', { class: 'anomaly-chip' }, [
    el('span', { class: 'anomaly-chip-label' }, [label]),
    el('span', { class: 'anomaly-chip-value' }, [value]),
  ]);
}

function renderOutcome(store: Store, chosen: EventOption, lines: readonly string[]): HTMLElement {
  return el('div', { class: 'anomaly-outcome' }, [
    el('h2', { class: 'anomaly-outcome-title' }, [chosen.label]),
    el('ul', { class: 'anomaly-outcome-list' }, lines.map((line) => el('li', {}, [line]))),
    button('Continue', { class: 'btn btn-primary' }, () => store.dispatch({ kind: 'leaveEvent' })),
  ]);
}
