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
import { renderLanding } from './screens/landing.ts';
import { renderMap } from './screens/map.ts';
import { renderReward } from './screens/reward.ts';
import { renderSafePlanet } from './screens/safe.ts';
import { renderStation } from './screens/station.ts';
import { renderEvent } from './screens/event.ts';
import { renderGameOver } from './screens/gameover.ts';
import { renderPause } from './screens/pause.ts';
import { el } from './dom.ts';

/** What is on screen right now: the phase, or the run's inner screen. */
type View = Phase | `run:${RunScreen}`;

/**
 * How long the fight stays on screen after the hit that ended it.
 *
 * Long enough to read the last log line and watch the bar empty, short enough
 * that it does not feel like the game has hung. Not shortened under
 * reduced-motion: this is a pause, not a tween.
 */
const DEATH_HOLD_MS = 2200;

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
    case 'run:landing':
      return renderLanding(store);
    case 'run:combat':
      return renderCombat(store);
    case 'run:reward':
      return renderReward(store);
    case 'run:safe':
      return renderSafePlanet(store);
    case 'run:station':
      return renderStation(store);
    case 'run:event':
      return renderEvent(store);
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
  /** Set while the killing blow is being held on screen. */
  let deathHold: ReturnType<typeof setTimeout> | null = null;
  /**
   * The hold has already been served for this death.
   *
   * Without it the timer's own re-render walks straight back into the branch
   * that scheduled it — the conditions are all still true — and the game-over
   * screen is deferred forever, one hold at a time.
   */
  let deathHeld = false;

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

    /*
     * Hold on the killing blow.
     *
     * The engine ends the run the instant health hits zero, so without this the
     * game-over screen replaces the fight in the same frame as the hit that
     * caused it — the player sees the result and never sees the cause. The hold
     * is presentation only: the run is already over in state, and nothing here
     * can change that. Anything that arrives during the hold (there is nothing
     * the player can dispatch) still lands, because this only defers the swap.
     */
    if (view === 'over' && mountedView === 'run:combat' && state.run?.outcome === 'died' && !deathHeld) {
      if (deathHold !== null) return;
      mounted?.classList.add('is-dying');
      deathHold = setTimeout(() => {
        deathHold = null;
        deathHeld = true;
        render(store.getState());
      }, DEATH_HOLD_MS);
      return;
    }
    if (deathHold !== null) {
      clearTimeout(deathHold);
      deathHold = null;
    }
    // A new run gets its own hold.
    if (view === 'title' || view === 'run:map') deathHeld = false;

    // Let the outgoing screen drop anything it bound outside its own subtree —
    // the combat screen owns a window-level keydown listener.
    mounted?.dispatchEvent(new CustomEvent('shinwar:unmount'));

    const screen = renderView(store, view);
    screen.tabIndex = -1;
    host.replaceChildren(screen);

    /*
     * Screens are BUILT detached — `liveScreen` renders once before it returns
     * the host — so anything that needs real layout cannot do it during the
     * build. A detached element reports `scrollHeight === clientHeight`, which
     * is why the map spent several attempts computing a scroll of zero and
     * remembering it. This is the first moment the screen is in the document.
     */
    screen.dispatchEvent(new CustomEvent('shinwar:mount'));

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
