/* The bar that sits above every between-fights screen.
 *
 * Health, Alloy, deck size, the seed, and the way into the pause screen. The
 * seed is here for the same reason it is on the title and the game-over
 * screen: with no saves it is the only thing that survives the tab closing,
 * and it is how a bug gets reported.
 */

import type { GameState } from '../../engine/types.ts';
import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { currentSeed, healthFraction } from '../../engine/queries.ts';
import { button, el } from '../dom.ts';

/** Below this fraction of max hull the Ship button starts asking for attention. */
const SHIP_ATTENTION_HULL = 0.25;

export function renderRunBar(store: Store, state: GameState): HTMLElement {
  const run = requireRun(state);

  return el('header', { class: 'run-bar' }, [
    el('div', { class: 'stat stat--hull' }, [
      el('div', { class: 'hull-head' }, [
        el('span', { class: 'stat-label' }, ['HEALTH']),
        el('span', { class: 'stat-value' }, [`${run.pilot.health}/${run.pilot.maxHealth}`]),
      ]),
      el('div', { class: 'bar bar--hull' }, [
        el('span', { class: 'bar-fill', style: `width:${healthFraction(run) * 100}%` }),
      ]),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label' }, ['ALLOY']),
      el('span', { class: 'stat-value' }, [String(run.alloy)]),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label' }, ['DECK']),
      el('span', { class: 'stat-value' }, [String(run.pilot.deck.length)]),
    ]),
    el('div', { class: 'stat stat--seed' }, [
      el('span', { class: 'stat-label' }, ['SEED']),
      el('span', { class: 'stat-value stat-value--mono' }, [currentSeed(state)]),
    ]),
    // The loadout is reachable from anywhere between fights, and says when it
    // wants attention: something unfitted in storage, or a hull low enough that
    // the next space fight is a coin flip. Both are things a player only finds
    // out at the worst moment otherwise.
    state.run?.combat === null && state.run?.shipCombat === null
      ? (() => {
          const stored = run.ship.stored.length;
          const hurt = run.ship.hull / Math.max(1, run.ship.maxHull) < SHIP_ATTENTION_HULL;
          const wants = stored > 0 || hurt;
          const node = button(
            stored > 0 ? `Ship (${stored})` : 'Ship',
            {
              class: `btn btn-quiet${wants ? ' is-attention' : ''}${hurt ? ' is-hurt' : ''}`,
              title: [
                stored > 0 ? `${stored} module${stored === 1 ? '' : 's'} unfitted in storage.` : null,
                hurt ? `Hull at ${Math.round((run.ship.hull / run.ship.maxHull) * 100)}%.` : null,
              ]
                .filter((part) => part !== null)
                .join(' ') || null,
            },
            () => store.dispatch({ kind: 'openLoadout' }),
          );
          return node;
        })()
      : null,
    // Asks the app shell to open the overlay rather than owning it — the
    // pause screen sits above every run screen, so it cannot belong to one.
    button('Pause', { class: 'btn btn-quiet', 'aria-keyshortcuts': 'P' }, () => {
      document.getElementById('app')?.dispatchEvent(new CustomEvent('shinwar:pause'));
    }),
  ]);
}
