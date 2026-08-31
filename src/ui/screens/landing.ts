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
import type { GameState, ResolvedThread } from '../../engine/types.ts';
import { relics as relicTable } from '../../content/registry.ts';
import { renderOutcomeLine } from '../components/peek.ts';

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

  /* The latch is per LANDING, not per mount, and that distinction is a bug
   * report: a `?` that turns out to be a derelict shows a second landing after
   * the first, and the screen is not remounted between them — the shell sees
   * 'landing' both times and only re-renders. A single `left` flag latched on
   * the first Continue and the second screen's button then did nothing at all.
   * No way forward, no way back: the run was over.
   *
   * The flag still exists, because the auto-advance timer and a click can both
   * fire for the same screen and dispatching twice would skip a node. It is
   * just scoped to the screen it belongs to. */
  let showing = '';
  let leftFor = '';

  const leave = (): void => {
    if (leftFor === showing) return;
    leftFor = showing;
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
    /* Two screens for one node — the arrival and, for a `?`, what it turned
       out to be — so the node id alone does not identify which one this is. */
    showing = `${landing.nodeId}#${landing.outcome === true ? 'outcome' : 'arrival'}`;

    const held = landing.resolved.length > 0;
    window.clearTimeout(timer);
    if (!held) timer = window.setTimeout(leave, HOLD_MS);

    const inner = el(
      'div',
      { class: `landing-inner${prefersReducedMotion() ? '' : ' is-arriving'}` },
      [
        /* "You set down on Dolmen Span" belongs to arriving, and the second
           screen is not an arrival — you are already there, and what it says is
           what you found. Repeating the header made the two screens look like
           the same one shown twice. */
        landing.outcome === true ? null : el('p', { class: 'landing-lede' }, ['You set down on']),
        landing.outcome === true ? null : el('h1', { class: 'landing-name' }, [landing.title]),
        el('p', { class: 'landing-body' }, [landing.body]),

        /* The causal link, spelled out: the Thread by name, what you took on,
           and what it just did. Vague when you agreed to it, explicit now. */
        ...landing.resolved.flatMap((thread) => [
          el('section', { class: `landing-thread landing-thread--${thread.tone}` }, [
            el('p', { class: 'landing-thread-head' }, ['A thread comes due']),
            el('h2', { class: 'landing-thread-name' }, [thread.name]),
            el('p', { class: 'landing-thread-promise' }, [thread.promise]),
            thread.lines.length === 0
              ? null
              : el(
                  'ul',
                  { class: 'landing-thread-lines' },
                  thread.lines.map((line) =>
                    el('li', { class: 'landing-thread-line' }, renderOutcomeLine(line, state)),
                  ),
                ),
          ]),
          /* The once-a-run payoff, told as its own moment rather than as one
             more bullet in the list above it. See `renderRevelation`. */
          thread.mastered === undefined ? null : renderRevelation(thread.mastered, state),
        ]),

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

/**
 * The once-a-run moment, told as one.
 *
 * The mastery payoff used to arrive as one more bullet in the Thread's payout
 * list — "The Sect Reliquary", set in the same type as "Regain 10 health", with
 * nothing saying what it does or that three rites had bought it. The largest
 * thing that can happen to a run read as a footnote to a heal.
 *
 * Three parts, in the order a player asks for them: WHAT arrived and what it
 * does, WHY it arrived, then the lore. The rules line comes out of the relic
 * registry rather than being written here, for the same reason card text is
 * generated — a hand-copied description of an artifact is wrong the first time
 * anybody retunes it.
 */
function renderRevelation(
  mastered: NonNullable<ResolvedThread['mastered']>,
  state: GameState,
): HTMLElement {
  /* Whatever the mastery granted, named and explained. Ids come down from the
     engine and the words come from the registry the inventory reads, so this
     cannot drift from the relic. */
  const granted = mastered.relicIds.flatMap((id) => {
    const def = relicTable.find(id);
    return def === undefined ? [] : [def];
  });

  return el('section', { class: 'landing-revelation', role: 'status' }, [
    el('p', { class: 'revelation-head' }, [mastered.head]),

    ...granted.map((def) =>
      el('div', { class: 'revelation-prize' }, [
        el('h2', { class: 'revelation-name' }, [def.name]),
        el('p', { class: 'revelation-rule' }, [def.text]),
      ]),
    ),

    /* A mastery that granted something with no relic to name — a card, Alloy —
       still says what it was. Never nothing. */
    granted.length > 0
      ? null
      : el(
          'ul',
          { class: 'landing-thread-lines' },
          mastered.lines.map((line) =>
            el('li', { class: 'landing-thread-line' }, renderOutcomeLine(line, state)),
          ),
        ),

    el('p', { class: 'revelation-because' }, [mastered.because]),

    ...mastered.body.map((paragraph) => el('p', { class: 'revelation-lore' }, [paragraph])),
  ]);
}
