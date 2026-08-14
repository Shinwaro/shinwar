/* The M0 placeholder for everything that happens after "Begin run".
 *
 * It dumps the state as JSON, next to the seed and the state hash. That is
 * genuinely the useful thing to have at this milestone: it is how you check
 * that a seed produces the run it should, and the hash is what the determinism
 * test compares.
 *
 * M1 replaces this with the combat screen.
 */

import type { Store } from '../store.ts';
import { toJson, hashState } from '../../engine/serialize.ts';
import { currentDepth, currentSeed } from '../../engine/queries.ts';
import { contentCounts } from '../../content/registry.ts';
import { button, el } from '../dom.ts';

function factRow(label: string, value: string): HTMLElement {
  return el('div', { class: 'fact' }, [
    el('span', { class: 'fact-label' }, [label]),
    el('span', { class: 'fact-value' }, [value]),
  ]);
}

export function renderRunDump(store: Store): HTMLElement {
  const state = store.getState();
  const outcome = state.run?.outcome ?? null;

  const counts = contentCounts();
  const contentLine = Object.entries(counts)
    .map(([name, count]) => `${name} ${count}`)
    .join(' · ');

  const facts = el('div', { class: 'facts' }, [
    factRow('Seed', currentSeed(state)),
    factRow('Depth', String(currentDepth(state))),
    factRow('State hash', hashState(state)),
    factRow('Schema', String(state.schema)),
    factRow('Content', contentLine),
  ]);

  const dump = el('pre', { class: 'dump', tabindex: '0', 'aria-label': 'Game state as JSON' }, [
    toJson(state),
  ]);

  const controls = el('div', { class: 'run-controls' }, [
    outcome === null
      ? button('Abandon run', { class: 'btn' }, () => {
          store.dispatch({ kind: 'abandonRun' });
        })
      : null,
    button('Back to title', { class: 'btn btn-primary' }, () => {
      store.dispatch({ kind: 'returnToTitle' });
    }),
  ]);

  const banner =
    outcome === null
      ? el('p', { class: 'run-note' }, [
          'M0 stops here. The engine, the seeded streams and the hook bus are in place; ' +
            'M1 puts a fight on top of them.',
        ])
      : el('p', { class: 'run-note run-note--over' }, [`Run ${outcome}.`]);

  return el('main', { class: 'rundump screen' }, [
    el('div', { class: 'rundump-inner' }, [
      el('h1', { class: 'screen-title' }, ['Run state']),
      banner,
      facts,
      dump,
      controls,
    ]),
  ]);
}
