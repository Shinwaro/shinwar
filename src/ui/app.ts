/* Mount point. Owns the scene, the screen host, the pause overlay, and the
 * `beforeunload` guard.
 *
 * The UI computes nothing about the game — it reads state, renders it, and
 * dispatches actions. Everything in here is presentation and plumbing.
 */

import type { GameState, Phase, RunScreen } from '../engine/types.ts';
import type { Store } from './store.ts';
import { shouldGuardUnload } from '../engine/queries.ts';
import { createSpaceScene } from './space.ts';
import { renderTitle } from './screens/title.ts';
import { renderCombat } from './screens/combat.ts';
import { renderMap } from './screens/map.ts';
import { renderReward } from './screens/reward.ts';
import { renderSafePlanet, renderStation } from './screens/safe.ts';
import { renderGameOver } from './screens/gameover.ts';
import { renderPause } from './screens/pause.ts';
import { el } from './dom.ts';

/** What is on screen right now: the phase, or the run's inner screen. */
type View = Phase | `run:${RunScreen}`;

function viewOf(state: GameState): View {
  if (state.phase !== 'run' || state.run === null) return state.phase;
  return `run:${state.run.screen}`;
}

function renderView(store: Store, view: View): HTMLElement {
  switch (view) {
    case 'title':
      return renderTitle(store);
    case 'over':
      return renderGameOver(store);
    case 'run:map':
      return renderMap(store);
    case 'run:combat':
      return renderCombat(store);
    case 'run:reward':
      return renderReward(store);
    case 'run:safe':
      return renderSafePlanet(store);
    case 'run:station':
      return renderStation(store);
    // Anomalies arrive at M4. Until then an event node never generates, so
    // this is unreachable — but it must render something rather than throw.
    case 'run:event':
      return renderMap(store);
    case 'run':
      return renderMap(store);
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}

export function mountApp(root: HTMLElement, store: Store): void {
  const sky = el('canvas', { class: 'sky', 'aria-hidden': 'true' });
  const key = el('div', { class: 'sky-key', 'aria-hidden': 'true' });
  const vignette = el('div', { class: 'sky-vignette', 'aria-hidden': 'true' });
  const host = el('div', { class: 'screen-host' });
  const overlay = el('div', { class: 'overlay-host' });

  root.replaceChildren(sky, key, vignette, host, overlay);

  const scene = createSpaceScene(sky);

  let mountedView: View | null = null;
  let mounted: HTMLElement | null = null;
  let paused = false;

  function closePause(): void {
    paused = false;
    overlay.replaceChildren();
  }

  function openPause(): void {
    if (paused || store.getState().run === null) return;
    paused = true;
    overlay.replaceChildren(renderPause(store, closePause));
    const panel = overlay.querySelector('.pause-panel');
    if (panel instanceof HTMLElement) {
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    }
  }

  function render(state: GameState): void {
    // The pause overlay is not a view; a state change under it (abandoning the
    // run) has to take it down.
    if (paused && state.run === null) closePause();
    if (paused && state.phase !== 'run') closePause();

    const view = viewOf(state);
    if (view === mountedView) return;

    // Let the outgoing screen drop anything it bound outside its own subtree —
    // the combat screen owns a window-level keydown listener.
    mounted?.dispatchEvent(new CustomEvent('shinwar:unmount'));

    const screen = renderView(store, view);
    screen.tabIndex = -1;
    host.replaceChildren(screen);

    // The asteroid backs the menu screens. Inside the run the stage gets its
    // own, quieter background — and a canvas nobody can see is a battery bug.
    document.body.dataset['phase'] = state.phase;
    document.body.dataset['view'] = view;
    if (state.phase === 'title' || state.phase === 'over') scene.start();
    else scene.stop();

    if (mountedView !== null) screen.focus({ preventScroll: true });

    mountedView = view;
    mounted = screen;
  }

  /* P pauses, Esc closes. Bound at the window so it works on every run screen
     rather than being re-bound by each of them. */
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    if (paused && event.key === 'Escape') {
      event.preventDefault();
      closePause();
      return;
    }
    if (!paused && event.key.toLowerCase() === 'p' && store.getState().run !== null) {
      event.preventDefault();
      openPause();
    }
  });

  /* One of the two mitigations for having no saves. The browser's own
     confirmation, armed only while a run is actually live — an unprompted
     "are you sure" on the title screen would train the player to dismiss it. */
  window.addEventListener('beforeunload', (event) => {
    if (!shouldGuardUnload(store.getState())) return;
    event.preventDefault();
    event.returnValue = '';
  });

  render(store.getState());
  store.subscribe(render);

  // The run bar's Pause button lives inside a screen, so it asks through here.
  root.addEventListener('shinwar:pause', openPause);
}
