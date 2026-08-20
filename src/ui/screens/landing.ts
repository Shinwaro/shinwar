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

    window.clearTimeout(timer);
    timer = window.setTimeout(leave, HOLD_MS);

    const inner = el(
      'div',
      { class: `landing-inner${prefersReducedMotion() ? '' : ' is-arriving'}` },
      [
        el('p', { class: 'landing-lede' }, ['You set down on']),
        el('h1', { class: 'landing-name' }, [landing.title]),
        el('p', { class: 'landing-body' }, [landing.body]),
        /* What resolved on the way in. A Thread coming due used to pay out into
           the log while the map re-rendered, so the promise it made five nodes
           ago arrived somewhere nobody was looking. */
        landing.notes.length === 0
          ? null
          : el(
              'ul',
              { class: 'landing-notes' },
              landing.notes.map((line) => el('li', { class: 'landing-note' }, [line])),
            ),
        button('Continue', { class: 'btn btn-quiet landing-go' }, leave),
      ],
    );

    // The whole plate is the dismiss target, so a player who is reading fast
    // never has to find the button.
    const plate = el('div', { class: 'landing-plate', role: 'button', tabindex: '0' }, [inner]);
    plate.addEventListener('click', leave);
    plate.addEventListener('keydown', (event) => {
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
