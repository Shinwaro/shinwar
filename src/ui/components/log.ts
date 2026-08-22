/* The combat log.
 *
 * Simultaneously the debugger and the player's answer to "why did I take 19
 * damage". Damage lines carry their full itemisation, straight out of the
 * damage pipeline — no number appears here without its derivation.
 *
 * `aria-live="polite"` so a screen reader hears the fight happen.
 */

import type { GameState, LogEntry } from '../../engine/types.ts';
import { el } from '../dom.ts';

/** Hook lines are for the developer; they would drown the player's log. */
const PLAYER_FACING: ReadonlySet<LogEntry['kind']> = new Set([
  'combat',
  'card',
  'damage',
  'block',
  'heat',
  'stance',
  'status',
]);

export function renderLog(state: GameState, open: boolean): HTMLElement {
  /* Newest first.
   *
   * A log you consult is not a log you read: the question is always "what just
   * happened", and the answer was at the bottom of a scrolling box that had to
   * be chased there on every render. At the top it is simply the first thing
   * in the panel, and the scroll position stops mattering.
   *
   * Reversed at the point of display rather than in `state.log`, which is an
   * append-only record and stays in the order things occurred. */
  const entries = state.log
    .filter((entry) => PLAYER_FACING.has(entry.kind))
    .slice(-120)
    .reverse();

  const list = el(
    'ol',
    { class: 'log-list' },
    entries.map((entry) =>
      el('li', { class: `log-line log-line--${entry.kind}` }, [
        el('span', { class: 'log-turn' }, [entry.turn > 0 ? `T${entry.turn}` : '—']),
        el('span', { class: 'log-text' }, [entry.text]),
      ]),
    ),
  );

  return el(
    'section',
    {
      class: `log ${open ? 'is-open' : 'is-closed'}`,
      'aria-label': 'Combat log',
      role: 'log',
      'aria-live': 'polite',
    },
    [list],
  );
}

/**
 * Keep the newest line in view.
 *
 * The newest line is the first one now, so this is a scroll to the top — and
 * it only fires when the reader has not scrolled away themselves. Yanking
 * somebody back to the top while they are reading three lines down is exactly
 * what a log should never do.
 */
export function scrollLogToNewest(node: Element): void {
  const list = node.querySelector('.log-list');
  if (list instanceof HTMLElement) list.scrollTop = 0;
}
