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
import { fxRemainingMs } from './anim.ts';
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
import { renderCoach } from './screens/coach.ts';
import { el } from './dom.ts';
import { play } from './sound.ts';
import { forgetHeat, forgetPips, forgetResources } from './anim.ts';
import { ENCOUNTERS } from '../content/encounters.ts';
import { SECT_RITES } from '../content/threads.ts';

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
/* The same idea, shorter, for a win.
 *
 * The engine clears the fight the instant the last enemy dies, so the salvage
 * screen replaced the board in the same frame as the blow that won it — you saw
 * the reward and never saw the kill. Shorter than the death hold because a win
 * is a beat, not an ending: long enough for the last number to land and the
 * enemy to finish dying, short enough that clearing a pack of Wisps does not
 * become four pauses in a row. */
const WIN_HOLD_MS = 1000;

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

let lastScreen: string | null = null;

/**
 * The sound of getting somewhere.
 *
 * Every kind of place has one, and they fire on ARRIVAL rather than on the
 * click that commits to the route — which is what makes an Unknown work
 * without a sound of its own: it resolves into a fight or an Anomaly and that
 * announces itself. Combat splits by what it is: an act finale, an Elite or a
 * Thread's reprisal all get the heavy one.
 *
 * Watched here rather than in each screen because it is a TRANSITION, and no
 * single screen can see one — the screen that is arriving has no idea what it
 * replaced, and the one it replaced is gone by the time it could ask.
 */
function arrivalSound(state: GameState): void {
  /* Keyed on the screen AND, for a landing, on which landing — a `?` that turns
     out to be a derelict shows two of them in a row, and 'landing' to 'landing'
     is not a screen change. The second one made no sound at all because of
     that. */
  const screen = state.run?.screen ?? null;
  const here =
    screen === 'landing'
      ? `landing#${state.run?.landing?.nodeId ?? ''}#${state.run?.landing?.outcome === true ? 'outcome' : 'arrival'}`
      : screen;
  if (here === lastScreen) return;
  const from = lastScreen === null ? null : lastScreen.split('#')[0] ?? null;
  lastScreen = here;

  /* Every fight starts fresh: the Heat gauge has no history to animate from,
     and animating from the last fight's would be a lie. */
  if (screen !== 'combat') {
    forgetHeat();
    forgetPips();
    forgetResources();
  }
  if (screen === null) return;

  /* Places are announced by the CHART, on the click that chose them — see
   * `nodeSound` in `renderMap`. Nothing is announced here on the way in, and
   * that is the fix for the Anomaly that played twice: it sounded once on the
   * click and once again when its screen opened, because both were trying to be
   * the moment of arrival.
   *
   * The one thing left here is the place nobody clicked. An Unknown is not a
   * place when you choose it, so it makes no sound then; when the `?` turns out
   * to be an Anomaly or a fight, THAT is its arrival — a little late by
   * definition, because until then there was nothing to announce. */
  /* A Thread coming due is announced HERE, not from the log.
   *
   * Sounds are chosen in `playLogFx`, which only ever runs on the combat
   * screen — and a Thread pays out while you are travelling, so the Rites
   * completing made no sound at all. It has a screen of its own; this is the
   * moment it appears. */
  if (screen === 'landing') {
    const resolved = state.run?.landing?.resolved ?? [];
    if (resolved.some((thread) => thread.threadId === SECT_RITES)) {
      play('rites');
      return;
    }
  }

  if (screen === 'landing' && state.run?.landing?.outcome === true) {
    // A `?` that came to nothing much. The report screen, and flying on.
    play('flyOn');
    return;
  }
  if (from !== 'landing' && from !== 'map') return;

  const nodeId = state.run?.position ?? null;
  const node = state.run?.map?.nodes.find((entry) => entry.id === nodeId) ?? null;
  if (node?.type !== 'unknown') return;

  if (screen === 'event') play('nodeAnomaly');
  else if (screen === 'combat') {
    const encounterId = state.run?.combat?.encounterId ?? null;
    const tier = ENCOUNTERS.find((entry) => entry.id === encounterId)?.tier ?? 'normal';
    const forced = state.run?.forcedTier ?? null;
    const heavy = tier !== 'normal' || (forced !== null && forced !== 'combat');
    play(heavy ? 'fightElite' : 'fightNormal');
  }
}

export function mountApp(root: HTMLElement, store: Store): void {
  const sky = el('canvas', { class: 'sky', 'aria-hidden': 'true' });
  const key = el('div', { class: 'sky-key', 'aria-hidden': 'true' });
  const vignette = el('div', { class: 'sky-vignette', 'aria-hidden': 'true' });
  const host = el('div', { class: 'screen-host' });
  const overlay = el('div', { class: 'overlay-host' });
  /* Its own host, under the pause dialog: pausing mid-introduction should put
     the pause screen on top rather than fight it for the same layer. */
  const coachOverlay = el('div', { class: 'coach-host' });

  root.replaceChildren(sky, key, vignette, host, coachOverlay, overlay);

  const scene = createSpaceScene(sky);

  let mountedView: View | null = null;
  let mounted: HTMLElement | null = null;
  let paused = false;
  /* The coach is mounted once per tutorial and never re-mounted — dismissing it
     has to stick, or skipping would just bring it back on the next render. */
  let coaching = false;
  let coached = false;
  /** Set while the last blow of a fight is being held on screen. */
  let outcomeHold: ReturnType<typeof setTimeout> | null = null;
  /**
   * The hold has already been served for this ending.
   *
   * Without it the timer's own re-render walks straight back into the branch
   * that scheduled it — the conditions are all still true — and the screen is
   * deferred forever, one hold at a time.
   */
  let outcomeHeld = false;

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

  function coachIfNeeded(state: GameState): void {
    const tutorial = state.run?.tutorial === true && state.phase === 'run';
    if (!tutorial) {
      // Leaving the introduction resets it, so a second visit teaches again.
      if (coaching) {
        coachOverlay.replaceChildren();
        coaching = false;
      }
      coached = false;
      return;
    }
    if (coaching || coached) return;

    coaching = true;
    coachOverlay.replaceChildren(
      renderCoach(store, () => {
        coaching = false;
        coached = true;
        coachOverlay.replaceChildren();
      }),
    );
  }

  function render(state: GameState): void {
    // The pause overlay is not a view; a state change under it (abandoning the
    // run) has to take it down.
    if (paused && state.run === null) closePause();
    if (paused && state.phase !== 'run') closePause();

    const view = viewOf(state);
    if (view === mountedView) return;

    /*
     * Hold on the last blow, whichever way it went.
     *
     * The engine settles a fight the instant it is decided, so without this the
     * screen that follows replaces the board in the same frame as the hit that
     * caused it — the player sees the result and never sees the cause. That was
     * true of the game-over screen and equally true of salvage: you won, and the
     * reward was already on screen before the enemy finished dying.
     *
     * Presentation only. The fight is already over in state and nothing here can
     * change that; anything arriving during the hold still lands, because this
     * only defers the swap.
     */
    const ending =
      mountedView === 'run:combat' && !outcomeHeld
        ? view === 'over' && state.run?.outcome === 'died'
          ? { ms: DEATH_HOLD_MS, dying: true }
          : view === 'run:reward'
            ? { ms: WIN_HOLD_MS, dying: false }
            : null
        : null;

    if (ending !== null) {
      if (outcomeHold !== null) return;
      if (ending.dying) mounted?.classList.add('is-dying');

      /* Two stages, and the zero-delay first one is the point.
       *
       * The combat screen subscribes to the store AFTER this shell does, so on
       * the notification that ends a fight this listener runs first — before
       * the screen has scheduled the floaters for the blow that ended it.
       * Reading `fxRemainingMs()` here would read the previous turn's. Yielding
       * once lets every subscriber finish, and then the number is the real one.
       *
       * The death hold keeps its flat figure: it is already long enough to
       * cover any blow, and the game-over screen is not a beat you want to
       * measure to the millisecond. */
      outcomeHold = setTimeout(() => {
        const wait = ending.dying ? ending.ms : fxRemainingMs() + ending.ms;
        outcomeHold = setTimeout(() => {
          outcomeHold = null;
          outcomeHeld = true;
          render(store.getState());
        }, wait);
      }, 0);
      return;
    }
    if (outcomeHold !== null) {
      clearTimeout(outcomeHold);
      outcomeHold = null;
    }
    /* Every fight gets its own hold, so the flag resets on the way OUT of the
       screen the hold delivered you to — not only at the start of a run, which
       would have served exactly one win per run. */
    if (view !== 'over' && view !== 'run:reward') outcomeHeld = false;

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
  coachIfNeeded(store.getState());
  store.subscribe((state) => {
    arrivalSound(state);
    render(state);
    coachIfNeeded(state);
  });

  /* Every button that does not already say something for itself.
   *
   * Delegated from the root rather than wired per control, because there are
   * about sixty of them across nine screens and the next one somebody adds
   * should not have to remember. `data-sound="own"` opts out — End turn, the
   * mute, the reward picks and the forge all have their own voice, and hearing
   * two things for one press is worse than hearing none.
   *
   * Cards and stars are `.card` and `.star`, not `.btn`, so they are already
   * outside this. Capture phase, so a handler that stops propagation cannot
   * silence the click that reached it. */
  root.addEventListener(
    'click',
    (event) => {
      const state = store.getState();
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button.btn');
      if (button === null || button.getAttribute('data-sound') === 'own') return;
      if (button.hasAttribute('disabled')) return;
      /* The main menu gets the picking sound rather than the plain click. It is
         the same gesture as choosing a card — you are selecting from a set of
         things, not confirming one — and the title screen is the first thing
         anybody hears, so it should sound like the game rather than like a
         button. */
      play(state.run === null ? 'target' : 'button');
    },
    true,
  );

  // The run bar's Pause button lives inside a screen, so it asks through here.
  root.addEventListener('shinwar:pause', openPause);
}
