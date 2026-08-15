/* Screens that keep themselves up to date.
 *
 * The app shell swaps screens when the *view* changes — title to map, map to
 * combat. But plenty of state changes happen without the view changing at all:
 * moving between map nodes, taking a card on the reward screen, repairing at a
 * station. A screen that renders once and never subscribes goes stale, and a
 * stale map is worse than a broken one — every node you click is a node that is
 * no longer reachable, so the clicks are silently ignored and the game looks
 * frozen.
 *
 * So every screen that can change under its own feet mounts through here.
 *
 * `build` returns `null` when the state no longer belongs to this screen. That
 * matters because listeners fire in subscription order: an outgoing screen can
 * be notified of the very state change that is about to replace it, and it must
 * not try to render someone else's state on the way out.
 */

import type { GameState } from '../engine/types.ts';
import type { Store } from './store.ts';
import { el } from './dom.ts';

export type ScreenBuilder = (state: GameState) => Node | null;

export function liveScreen(store: Store, className: string, build: ScreenBuilder): HTMLElement {
  const host = el('main', { class: className });

  /*
   * Re-entrancy guard. Replacing the children removes whatever had focus,
   * which fires `blur` synchronously — and a `blur` handler that asks for a
   * re-render lands back in here while the DOM is mid-mutation, which throws
   * `NotFoundError`. Dropping the nested call is correct as well as safe: the
   * outer render is already producing the newest state.
   */
  let rendering = false;

  const render = (state: GameState): void => {
    if (rendering) return;
    const child = build(state);
    if (child === null) return;
    rendering = true;
    try {
      host.replaceChildren(child);
    } finally {
      rendering = false;
    }
  };

  // Unsubscribing on unmount is not tidiness: without it every screen ever
  // mounted keeps re-rendering into a detached node for the rest of the run.
  const unsubscribe = store.subscribe(render);
  host.addEventListener('shinwar:unmount', unsubscribe);

  render(store.getState());
  return host;
}
