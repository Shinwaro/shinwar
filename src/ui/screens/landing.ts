/* Arriving somewhere.
 *
 * The chart goes dark, the place says what it is, and then it becomes a fight
 * or a shop or nothing at all. Before this, a node resolved on the click — so
 * setting down somewhere empty was indistinguishable from a misclick, and a
 * fight arrived with no moment of arrival in front of it.
 *
 * It advances on its own after a beat, and on any click or key before that.
 * Never *only* on a timer: a screen that cannot be dismissed is a screen that
 * feels broken the second time you read it.
 */

import type { Store } from '../store.ts';
import { requireRun } from '../../engine/state.ts';
import { button, el } from '../dom.ts';
import { liveScreen } from '../screen.ts';
import { prefersReducedMotion } from '../anim.ts';

/**
 * How long it holds before moving on.
 *
 * Long enough to read two sentences without hurrying, short enough that a
 * player who already knows what a Station is does not resent it. Under
 * reduced-motion the fade is skipped but the beat is not — this is a pause, not
 * an animation.
 */
const HOLD_MS = 2600;

export function renderLanding(store: Store): HTMLElement {
  let timer = 0;
  let left = false;

  const leave = (): void => {
    if (left) return;
    left = true;
    window.clearTimeout(timer);
    store.dispatch({ kind: 'leaveLanding' });
  };

  const host = liveScreen(store, 'landing screen', (state) => {
    if (state.run === null || state.run.screen !== 'landing') return null;
    const landing = requireRun(state).landing;
    if (landing === null) return null;

    /*
     * A Thread paying out stops the clock.
     *
     * The auto-advance exists so an empty node does not become a click you have
     * to make. But a promise from five nodes ago landing is the one thing on
     * this screen the player has to actually read — hurrying it past is how a
     * Thread ends up feeling like the game did something arbitrary. If anything
     * came due, the screen waits.
     */
    const held = landing.resolved.length > 0;
    window.clearTimeout(timer);
    if (!held) timer = window.setTimeout(leave, HOLD_MS);

    const inner = el(
      'div',
      { class: `landing-inner${prefersReducedMotion() ? '' : ' is-arriving'}` },
      [
        el('p', { class: 'landing-lede' }, ['You set down on']),
        el('h1', { class: 'landing-name' }, [landing.title]),
        el('p', { class: 'landing-body' }, [landing.body]),

        /* The causal link, spelled out: the Thread by name, what you took on,
           and what it just did. Vague when you agreed to it, explicit now. */
        ...landing.resolved.map((thread) =>
          el('section', { class: `landing-thread landing-thread--${thread.tone}` }, [
            el('p', { class: 'landing-thread-head' }, ['A thread comes due']),
            el('h2', { class: 'landing-thread-name' }, [thread.name]),
            el('p', { class: 'landing-thread-promise' }, [thread.promise]),
            thread.lines.length === 0
              ? null
              : el(
                  'ul',
                  { class: 'landing-thread-lines' },
                  thread.lines.map((line) => el('li', { class: 'landing-thread-line' }, [line])),
                ),
          ]),
        ),

        button(held ? 'Understood' : 'Continue', { class: `btn landing-go ${held ? 'btn-primary' : 'btn-quiet'}` }, leave),
      ],
    );

    /*
     * Normally the whole plate dismisses, so a player who reads fast never has
     * to hunt for the button. When a Thread has paid out it does not: a stray
     * click would wipe the one thing on the screen that has to be read, and the
     * cost of a deliberate click is much lower than the cost of missing it.
     */
    const plate = el('div', { class: `landing-plate${held ? ' is-held' : ''}`, role: 'button', tabindex: '0' }, [inner]);
    if (!held) plate.addEventListener('click', leave);
    plate.addEventListener('keydown', (event) => {
      if (held) return;
      if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        leave();
      }
    });
    queueMicrotask(() => plate.focus());
    return plate;
  });

  return host;
}
