/* What you are carrying, down the side of the fight.
 *
 * Relics, implants and masteries are the half of the run that changes what a
 * turn can *do* — an Energy, a card, plating on every hit — and mid-fight they
 * were only visible behind the pause key. So the moment you most need to
 * remember that every attack deals two more is the moment you have to leave
 * the fight to check.
 *
 * Every entry open, all the time. It began as initials with the text on hover,
 * which is right for something you look UP and wrong for something you need to
 * remember: "every attack deals 2 more" changes how you read your whole hand,
 * and a reminder you have to go and ask for is not a reminder.
 *
 * It sits beside the health readout, because that is where the eye already
 * goes at the start of a turn.
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
  readonly name: string;
  readonly text: string;
  readonly kind: 'relic' | 'implant' | 'mastery';
  readonly count: number;
}

function collect(state: GameState): readonly Carried[] {
  const pilot = state.run?.pilot;
  if (pilot === undefined) return [];

  const out: Carried[] = [];

  for (const id of pilot.relics) {
    const def = relicTable.find(id);
    if (def === undefined) continue;
    out.push({
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

  /* Everything open, all the time.
     It was initials with the text on hover, which is fine for a thing you look
     up and wrong for a thing you need to REMEMBER. The whole reason this rail
     exists is that "every attack deals 2 more" changes how you read your hand,
     and a reminder you have to go and ask for is not a reminder. */
  return el(
    'aside',
    { class: 'carried', 'aria-label': 'What you are carrying' },
    carried.map((entry) =>
      el('div', { class: `carried-row carried-row--${entry.kind}` }, [
        el('span', { class: 'carried-name' }, [
          entry.count > 1 ? `${entry.name} x${entry.count}` : entry.name,
        ]),
        el('span', { class: 'carried-text' }, [entry.text]),
      ]),
    ),
  );
}
