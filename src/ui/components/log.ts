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
  const entries = state.log.filter((entry) => PLAYER_FACING.has(entry.kind)).slice(-120);

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

/** Keep the newest line in view without yanking the page around. */
export function scrollLogToEnd(node: Element): void {
  const list = node.querySelector('.log-list');
  if (list instanceof HTMLElement) list.scrollTop = list.scrollHeight;
}
