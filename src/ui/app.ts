/* Mount point. Owns the scene, the screen host, and the phase swap.
 *
 * The UI computes nothing about the game — it reads state, renders it, and
 * dispatches actions. Everything in here is presentation and plumbing.
 */

import type { GameState, Phase } from '../engine/types.ts';
import type { Store } from './store.ts';
import { createSpaceScene } from './space.ts';
import { renderTitle } from './screens/title.ts';
import { renderCombat } from './screens/combat.ts';
import { renderGameOver } from './screens/gameover.ts';
import { el } from './dom.ts';

function renderScreen(store: Store, state: GameState): HTMLElement {
  switch (state.phase) {
    case 'title':
      return renderTitle(store);
    case 'run':
      return renderCombat(store);
    case 'over':
      return renderGameOver(store);
    default: {
      const unreachable: never = state.phase;
      return unreachable;
    }
  }
}

export function mountApp(root: HTMLElement, store: Store): void {
  /* The scene sits behind everything, fixed to the viewport. */
  const sky = el('canvas', { class: 'sky', 'aria-hidden': 'true' });
  const key = el('div', { class: 'sky-key', 'aria-hidden': 'true' });
  const vignette = el('div', { class: 'sky-vignette', 'aria-hidden': 'true' });
  const host = el('div', { class: 'screen-host' });

  root.replaceChildren(sky, key, vignette, host);

  const scene = createSpaceScene(sky);

  let mountedPhase: Phase | null = null;
  let mounted: HTMLElement | null = null;

  function render(state: GameState): void {
    const phase = state.phase;
    if (phase === mountedPhase) return;

    // Let the outgoing screen drop anything it bound outside its own subtree —
    // the combat screen owns a window-level keydown listener.
    mounted?.dispatchEvent(new CustomEvent('shinwar:unmount'));

    const screen = renderScreen(store, state);
    screen.tabIndex = -1;
    host.replaceChildren(screen);

    // The asteroid backs the title and menu screens only. Inside a run the
    // stage gets its own, quieter background — and a canvas nobody can see is
    // a battery bug.
    document.body.dataset['phase'] = phase;
    if (phase === 'title' || phase === 'over') scene.start();
    else scene.stop();

    // Keyboard users land on the new screen rather than back at the top of the
    // document. Skipped on first paint so the page does not steal focus.
    if (mountedPhase !== null) screen.focus({ preventScroll: true });

    mountedPhase = phase;
    mounted = screen;
  }

  render(store.getState());
  store.subscribe(render);
}
