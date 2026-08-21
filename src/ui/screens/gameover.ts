/* The end of a run.
 *
 * With no saves and no scores, this screen is the only thing a run leaves
 * behind, so it has to be worth reading. The words come from
 * `engine/run/epilogue.ts` — the UI computes nothing here, it just lays out
 * what the engine says about the run.
 *
 * The seed is here because it is here on every screen: it is the one thing
 * that survives the tab closing, and it is how a bug gets reported. "Fly it
 * again" reuses it deliberately — the same run, so a different line can
 * actually be tested against it.
 */

import type { Store } from '../store.ts';
import { currentDepth, currentSeed } from '../../engine/queries.ts';
import { epilogueFor } from '../../engine/run/epilogue.ts';
import { button, el } from '../dom.ts';
import { newSeed } from './title.ts';

export function renderGameOver(store: Store): HTMLElement {
  const state = store.getState();
  const outcome = state.run?.outcome ?? 'abandoned';
  const seed = currentSeed(state);
  const epilogue = epilogueFor(state);

  const seedRow = el('div', { class: 'over-seed' }, [
    el('span', { class: 'field-label' }, ['Seed']),
    el('code', { class: 'over-seed-value' }, [seed]),
    el('span', { class: 'field-help' }, [`Depth ${currentDepth(state)}`]),
  ]);

  const account =
    epilogue === null
      ? [el('p', { class: 'over-account' }, ['The run ended before it started.'])]
      : epilogue.paragraphs.map((text) => el('p', { class: 'over-account' }, [text]));

  /* The unfinished Threads get their own block rather than a sentence, because
     this is the part of the run the player chose and the part they will read
     twice. The description is shown, not just the name — by the end screen the
     name alone has stopped meaning anything. */
  const unfinished =
    epilogue === null || epilogue.unfinished.length === 0
      ? null
      : el('section', { class: 'over-unfinished' }, [
          el('h2', { class: 'over-subhead' }, ['Left open']),
          el(
            'ul',
            { class: 'over-threads' },
            epilogue.unfinished.map((def) =>
              el('li', { class: `over-thread over-thread--${def.tone}` }, [
                el('span', { class: 'over-thread-name' }, [def.name]),
                el('span', { class: 'over-thread-text' }, [def.description]),
              ]),
            ),
          ),
        ]);

  const ledger =
    epilogue === null
      ? null
      : el(
          'dl',
          { class: 'over-ledger' },
          epilogue.ledger.flatMap((entry) => [
            el('dt', {}, [entry.label]),
            el('dd', {}, [entry.value]),
          ]),
        );

  return el('main', { class: 'over screen' }, [
    el('div', { class: 'over-inner' }, [
      el('header', { class: 'over-head' }, [
        el('h1', { class: `over-title over-title--${outcome}` }, [
          epilogue?.headline ?? 'Run over.',
        ]),
        epilogue === null ? null : el('p', { class: 'over-standfirst' }, [epilogue.standfirst]),
      ]),
      ...account,
      unfinished,
      ledger,
      seedRow,
      el('div', { class: 'over-actions' }, [
        button('Fly it again — same seed', { class: 'btn btn-primary' }, () => {
          store.dispatch({ kind: 'returnToTitle' });
          store.dispatch({ kind: 'setSeed', seed });
          store.dispatch({ kind: 'beginRun' });
        }),
        button('New seed', { class: 'btn' }, () => {
          store.dispatch({ kind: 'returnToTitle' });
          store.dispatch({ kind: 'setSeed', seed: newSeed() });
          store.dispatch({ kind: 'beginRun' });
        }),
        button('Back to title', { class: 'btn' }, () => {
          store.dispatch({ kind: 'returnToTitle' });
        }),
      ]),
    ]),
  ]);
}
