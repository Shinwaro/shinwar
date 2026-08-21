/* What you are carrying, down the side of the fight.
 *
 * Relics, implants and masteries are the half of the run that changes what a
 * turn can *do* — an Energy, a card, plating on every hit — and mid-fight they
 * were only visible behind the pause key. So the moment you most need to
 * remember that every attack deals two more is the moment you have to leave
 * the fight to check.
 *
 * A rail rather than a panel, and deliberately terse: initials and a count,
 * with the full text on hover and on focus. It has to be readable at a glance
 * without competing with the hand for attention, which means it cannot be
 * prose. There is nothing here you cannot also get from the pause screen; this
 * is the reminder, not the reference.
 *
 * Hidden entirely when you carry nothing, which is most of Act 1 — an empty
 * rail is furniture that teaches the eye to skip that corner.
 */

import type { GameState } from '../../engine/types.ts';
import {
  implants as implantTable,
  masteries as masteryTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { describeImplant } from '../../engine/run/describe.ts';
import { el } from '../dom.ts';

interface Carried {
  readonly key: string;
  readonly initials: string;
  readonly name: string;
  readonly text: string;
  readonly kind: 'relic' | 'implant' | 'mastery';
  readonly count: number;
}

/** Two letters, from the words that carry the name. */
function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter((word) => word !== '');
  const meaty = words.filter((word) => !['the', 'of', 'a'].includes(word.toLowerCase()));
  const use = meaty.length > 0 ? meaty : words;
  if (use.length === 1) return (use[0] as string).slice(0, 2).toUpperCase();
  return use
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function collect(state: GameState): readonly Carried[] {
  const pilot = state.run?.pilot;
  if (pilot === undefined) return [];

  const out: Carried[] = [];

  for (const id of pilot.relics) {
    const def = relicTable.find(id);
    if (def === undefined) continue;
    out.push({
      key: `relic:${id}`,
      initials: initialsOf(def.name),
      name: def.name,
      text: def.text,
      kind: 'relic',
      count: 1,
    });
  }

  // Implants stack, so they are tallied rather than repeated — two rows saying
  // "Honed Edge" reads as a rendering fault, not as two of them.
  for (const id of [...new Set(pilot.implants)]) {
    const def = implantTable.find(id);
    if (def === undefined) continue;
    out.push({
      key: `implant:${id}`,
      initials: initialsOf(def.name),
      name: def.name,
      text: describeImplant(def),
      kind: 'implant',
      count: pilot.implants.filter((held) => held === id).length,
    });
  }

  for (const id of pilot.masteries) {
    const def = masteryTable.find(id);
    if (def === undefined) continue;
    out.push({
      key: `mastery:${id}`,
      initials: initialsOf(def.name),
      name: def.name,
      text: def.text,
      kind: 'mastery',
      count: 1,
    });
  }

  return out;
}

export function renderCarried(state: GameState): HTMLElement | null {
  const carried = collect(state);
  if (carried.length === 0) return null;

  return el(
    'aside',
    { class: 'carried', 'aria-label': 'What you are carrying' },
    carried.map((entry) =>
      /* A button, so it is keyboard reachable and the detail is not
         mouse-only. It does nothing when pressed — the hover and focus states
         are the whole interaction — but a div with a tooltip would be
         unreachable, and this is exactly the information a player who cannot
         use a mouse most needs mid-fight. */
      el(
        'button',
        {
          type: 'button',
          class: `carried-chip carried-chip--${entry.kind}`,
          title: `${entry.name} — ${entry.text}`,
        },
        [
          el('span', { class: 'carried-mark', 'aria-hidden': 'true' }, [entry.initials]),
          entry.count > 1
            ? el('span', { class: 'carried-count', 'aria-hidden': 'true' }, [`${entry.count}`])
            : null,
          el('span', { class: 'carried-detail' }, [
            el('span', { class: 'carried-name' }, [
              entry.count > 1 ? `${entry.name} x${entry.count}` : entry.name,
            ]),
            el('span', { class: 'carried-text' }, [entry.text]),
          ]),
        ],
      ),
    ),
  );
}
