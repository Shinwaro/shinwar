/* The Manifest.
 *
 * Every Thread the run is carrying, always visible, with what it is and what
 * kind of thing is coming. Knowing "I am Marked" is what makes the reprisal
 * feel earned instead of random — DESIGN.md §4 — so this is not a nicety and it
 * is not tucked behind a hover.
 *
 * The countdown is shown too. Nothing a player could compute belongs on the
 * hidden list; what stays hidden is the payoff itself, and the omen names its
 * category so the player is never guessing blind.
 */

import type { GameState } from '../../engine/types.ts';
import { requireRun } from '../../engine/state.ts';
import { activeThreads } from '../../engine/run/threads.ts';
import { threads as threadTable } from '../../content/registry.ts';
import { el } from '../dom.ts';

export function renderManifest(state: GameState, heading = 'Manifest'): HTMLElement | null {
  if (state.run === null) return null;
  const run = requireRun(state);
  const carried = activeThreads(run);
  if (carried.length === 0) return null;

  return el('section', { class: 'manifest' }, [
    el('h2', { class: 'manifest-heading' }, [heading]),
    el(
      'ul',
      { class: 'manifest-list' },
      carried.map((thread) => {
        const def = threadTable.find(thread.threadId);
        if (def === undefined) return null;
        const left = Math.max(0, def.trigger.count - thread.progress);

        return el('li', { class: `manifest-thread manifest-thread--${def.tone}` }, [
          el('span', { class: 'manifest-name' }, [def.name]),
          el('span', { class: 'manifest-due' }, [
            left === 0 ? 'Due now' : left === 1 ? 'Due next node' : `${left} nodes`,
          ]),
          el('span', { class: 'manifest-desc' }, [def.description]),
          el('span', { class: 'manifest-omen' }, [def.omen]),
        ]);
      }),
    ),
  ]);
}
