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
import { renderFullscreenButton } from '../fullscreen.ts';

export function renderRunBar(_store: Store, state: GameState): HTMLElement {
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
    /* Both controls in one cell.
     *
     * The bar is a five-column grid — four readouts and a slot for what you can
     * press — so a second loose button does not go beside the first, it starts
     * an implicit second ROW and stretches across the bar. One wrapper keeps
     * the column count a fact about the layout rather than a thing that has to
     * be counted again every time something is added. */
    el('div', { class: 'run-bar-actions' }, [
      /* An hour with no saves is a sitting, and a sitting wants the whole
         screen. Absent where the browser does not offer it — a control that
         cannot work is not a control, it is a thing that looks broken. */
      renderFullscreenButton('btn btn-quiet'),
      // Asks the app shell to open the overlay rather than owning it — the
      // pause screen sits above every run screen, so it cannot belong to one.
      button('Pause', { class: 'btn btn-quiet', 'aria-keyshortcuts': 'P' }, () => {
        document.getElementById('app')?.dispatchEvent(new CustomEvent('shinwar:pause'));
      }),
    ]),
  ]);
}
