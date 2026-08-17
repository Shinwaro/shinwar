/* The pause screen.
 *
 * Load-bearing at an hour a run: the player needs to look up their deck, their
 * loadout and their Threads mid-fight without leaving combat. §6's information
 * rules apply here — everything present, nothing hidden.
 *
 * An in-page dialog, never a browser one — those block the whole tab, cannot
 * be styled, and on mobile can be suppressed entirely. Abandon Run sits behind
 * a second click for the obvious reason.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { definitionOf } from '../../engine/combat/combat.ts';
import { describeCard, describeCost } from '../../engine/combat/describe.ts';
import { currentDepth, currentSeed, depthRules } from '../../engine/queries.ts';
import {
  masteries as masteryTable,
  modules as moduleTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { renderManifest } from '../components/manifest.ts';

export interface PauseHandle {
  readonly node: HTMLElement;
  close(): void;
}

export function renderPause(store: Store, onClose: () => void): HTMLElement {
  let confirming = false;
  const host = el('div', { class: 'pause-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' });

  const rerender = (): void => {
    host.replaceChildren(build(store, store.getState(), confirming, (next) => {
      confirming = next;
      rerender();
    }, onClose));
  };

  // Clicking the backdrop closes, same as Esc. Clicking the panel must not.
  host.addEventListener('click', (event) => {
    if (event.target === host) onClose();
  });

  rerender();
  return host;
}

function build(
  store: Store,
  state: GameState,
  confirming: boolean,
  setConfirming: (next: boolean) => void,
  onClose: () => void,
): HTMLElement {
  const run = requireRun(state);
  const rules = depthRules(currentDepth(state)).filter((rule) => rule.text !== null);

  const deck = [...run.pilot.deck]
    .sort((a, b) => (definitionOf(a).name < definitionOf(b).name ? -1 : 1))
    .map((card) => {
      const def = definitionOf(card);
      return el('li', { class: 'pause-card' }, [
        el('span', { class: 'pause-card-cost' }, [describeCost(def)]),
        el('span', { class: 'pause-card-name' }, [def.name]),
        el('span', { class: 'pause-card-text' }, [describeCard(def)]),
      ]);
    });

  const seedRow = el('div', { class: 'over-seed' }, [
    el('span', { class: 'field-label' }, ['Seed']),
    el('code', { class: 'over-seed-value' }, [currentSeed(state)]),
    el('span', { class: 'field-help' }, [`Depth ${currentDepth(state)}`]),
  ]);

  return el('div', { class: 'pause-panel' }, [
    el('h1', { class: 'screen-title' }, ['Paused']),
    seedRow,

    el('div', { class: 'pause-facts' }, [
      fact('Health', `${run.pilot.health}/${run.pilot.maxHealth}`),
      fact('Alloy', String(run.alloy)),
      fact('Deck', String(run.pilot.deck.length)),
      fact('Act', String(run.act)),
    ]),

    el('section', { class: 'pause-section' }, [
      el('h2', { class: 'pause-heading' }, ['Ship']),
      el('p', { class: 'pause-empty' }, [
        `Hull ${run.ship.hull}/${run.ship.maxHull}. ` +
          (run.ship.placed.length === 0
            ? 'Nothing on the grid.'
            : `${run.ship.placed.map((entry) => moduleTable.get(entry.moduleId).name).join(', ')} fitted.`) +
          (run.ship.stored.length === 0
            ? ''
            : ` ${run.ship.stored.length} in storage.`),
      ]),
    ]),

    // Relics are the run's power curve. They belong high on the panel, not
    // under a deck list you have to scroll past.
    run.pilot.relics.length === 0
      ? null
      : el('section', { class: 'pause-section' }, [
          el('h2', { class: 'pause-heading' }, [`Relics (${run.pilot.relics.length})`]),
          el(
            'ul',
            { class: 'mastery-list' },
            run.pilot.relics.map((id) => {
              const def = relicTable.find(id);
              if (def === undefined) return null;
              return el('li', { class: 'mastery-line', 'data-rarity': def.rarity }, [
                el('span', { class: 'mastery-name' }, [def.name]),
                el('span', { class: 'mastery-text' }, [def.text]),
              ]);
            }),
          ),
        ]),

    // Masteries rewrite how the whole deck reads, so they belong above the
    // deck list rather than as a footnote under it.
    run.pilot.masteries.length === 0
      ? null
      : el('section', { class: 'pause-section' }, [
          el('h2', { class: 'pause-heading' }, ['Stance Masteries']),
          el(
            'ul',
            { class: 'mastery-list' },
            run.pilot.masteries.map((id) => {
              const def = masteryTable.find(id);
              if (def === undefined) return null;
              return el('li', { class: `mastery-line mastery-line--${def.stance}` }, [
                el('span', { class: 'mastery-name' }, [def.name]),
                el('span', { class: 'mastery-text' }, [def.text]),
              ]);
            }),
          ),
        ]),

    renderManifest(state) ??
      el('section', { class: 'pause-section' }, [
        el('h2', { class: 'pause-heading' }, ['Manifest']),
        el('p', { class: 'pause-empty' }, ['Nothing carried. Anomalies are where Threads come from.']),
      ]),

    rules.length === 0
      ? null
      : el('section', { class: 'pause-section' }, [
          el('h2', { class: 'pause-heading' }, ['Depth rules in force']),
          el('ul', { class: 'depth-rules' }, rules.map((rule) =>
            el('li', { class: 'depth-rule' }, [
              el('span', { class: 'depth-rule-n' }, [String(rule.depth)]),
              el('span', {}, [rule.text ?? '']),
            ]),
          )),
        ]),

    el('section', { class: 'pause-section' }, [
      el('h2', { class: 'pause-heading' }, [`Deck (${run.pilot.deck.length})`]),
      el('ul', { class: 'pause-deck' }, deck),
    ]),

    el('div', { class: 'pause-actions' }, [
      button('Resume', { class: 'btn btn-primary' }, onClose),
      confirming
        ? el('div', { class: 'pause-confirm' }, [
            el('span', {}, ['Abandon the run? There are no saves.']),
            button('Yes, abandon', { class: 'btn btn-danger' }, () => {
              store.dispatch({ kind: 'abandonRun' });
            }),
            button('No', { class: 'btn btn-quiet' }, () => setConfirming(false)),
          ])
        : button('Abandon run', { class: 'btn btn-quiet' }, () => setConfirming(true)),
    ]),
  ]);
}

function fact(label: string, value: string): HTMLElement {
  return el('div', { class: 'fact' }, [
    el('span', { class: 'fact-label' }, [label]),
    el('span', { class: 'fact-value' }, [value]),
  ]);
}
