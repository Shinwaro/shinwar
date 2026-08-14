/* The end of a run.
 *
 * Failure has to produce something. At M1 that is an honest account of the
 * fight and the seed that produced it; the generated epilogue lands at M7.
 *
 * The seed is here because it is here on every screen — with no saves, it is
 * the one thing that survives the tab closing, and it is how a bug gets
 * reported. "Fight again" reuses it deliberately: the same fight, so you can
 * actually test a different line against it.
 */

import type { Store } from '../store.ts';
import { currentDepth, currentSeed } from '../../engine/queries.ts';
import { enemies as enemyTable } from '../../content/registry.ts';
import { button, el } from '../dom.ts';
import { newSeed } from './title.ts';

export function renderGameOver(store: Store): HTMLElement {
  const state = store.getState();
  const run = state.run;
  const outcome = run?.outcome ?? 'abandoned';
  const combat = run?.combat ?? null;
  const seed = currentSeed(state);

  const headline =
    outcome === 'won' ? 'Contact cleared.' : outcome === 'died' ? 'Hull breached.' : 'Run abandoned.';

  const account =
    combat === null
      ? 'The run ended before contact.'
      : [
          `${combat.turn} turn${combat.turn === 1 ? '' : 's'}.`,
          `Hull ${run?.pilot.hull ?? 0} of ${run?.pilot.maxHull ?? 0}.`,
          `Heat ended at ${combat.heat}.`,
          combat.exhaust.length > 0 ? `${combat.exhaust.length} card(s) burned away.` : null,
        ]
          .filter((part) => part !== null)
          .join(' ');

  const roster =
    combat === null
      ? null
      : el('p', { class: 'over-roster' }, [
          `Against: ${[...new Set(combat.enemies.map((enemy) => enemyTable.get(enemy.defId).name))].join(', ')}.`,
        ]);

  const seedRow = el('div', { class: 'over-seed' }, [
    el('span', { class: 'field-label' }, ['Seed']),
    el('code', { class: 'over-seed-value' }, [seed]),
    el('span', { class: 'field-help' }, [`Depth ${currentDepth(state)}`]),
  ]);

  return el('main', { class: 'over screen' }, [
    el('div', { class: 'over-inner' }, [
      el('h1', { class: `over-title over-title--${outcome}` }, [headline]),
      el('p', { class: 'over-account' }, [account]),
      roster,
      seedRow,
      el('p', { class: 'over-note' }, [
        'M1 ends here — one fight, no map. The run loop, rewards and the map arrive at M2.',
      ]),
      el('div', { class: 'over-actions' }, [
        button('Fight again — same seed', { class: 'btn btn-primary' }, () => {
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
