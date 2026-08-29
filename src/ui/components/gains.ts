/* What everything you are carrying adds up to.
 *
 * The rail beside it lists the relics and implants one by one, which is the
 * right thing when you are deciding whether to take one. It is the wrong thing
 * at the moment you are working out what a card will do: by Act 3 there are
 * nine lines up there, four of them touching damage, and the player is adding
 * them in their head every single turn.
 *
 * So this is the total. It reads `pilotRules`, which is the same aggregate the
 * damage pipeline reads — the UI is not summing anything, it is showing the sum
 * the engine already made. A panel that did its own arithmetic could disagree
 * with the fight, which is the one thing it must never do.
 *
 * **Damage taken is deliberately absent.** Flat reduction lands at step 5 of
 * the pipeline, before Block, so every enemy telegraph on screen has already
 * subtracted it — the 9 above an enemy's head is what it will actually swing
 * for. Printing "-1 damage taken" here would be the same fact twice, and the
 * second copy invites the player to subtract it again.
 */

import type { GameState } from '../../engine/types.ts';
import { pilotRules } from '../../engine/combat/rules.ts';
import { el } from '../dom.ts';

interface Gain {
  readonly value: string;
  readonly label: string;
  /** Shown small, for the ones that carry a condition. */
  readonly note?: string;
}

export function renderGains(state: GameState): HTMLElement | null {
  if (state.run?.combat === null || state.run === null) return null;

  const rules = pilotRules(state);
  const gains: Gain[] = [];

  const add = (test: number, value: string, label: string, note?: string): void => {
    if (test === 0) return;
    gains.push(note === undefined ? { value, label } : { value, label, note });
  };

  /* Damage first: it is the number being added up mid-turn, and the notes are
     load-bearing — there are two flat sources and they are not the same sum.
     One lands on the card's first swing only, the other on all of them, so on a
     three-hit card the first is worth what it says and the second is worth
     three times it. Two rows, each saying which it is, because a player adding
     them in their head cannot be asked to remember which was which. */
  add(rules.damageEveryHit, `+${rules.damageEveryHit}`, 'damage', 'every hit of a card');
  add(rules.damageFlat, `+${rules.damageFlat}`, 'damage', 'first hit of a card');
  add(rules.energyPerTurn, `+${rules.energyPerTurn}`, 'Energy a turn');
  add(rules.drawPerTurn, `+${rules.drawPerTurn}`, rules.drawPerTurn === 1 ? 'card a turn' : 'cards a turn');
  add(rules.blockPerTurn, `+${rules.blockPerTurn}`, 'Block a turn');
  add(rules.focusPerTurn, `+${rules.focusPerTurn}`, 'Focus a turn');
  add(rules.startingFocus, `+${rules.startingFocus}`, 'Focus at the start');
  add(rules.focusPerStackBonus, `+${rules.focusPerStackBonus}`, 'per Focus spent');
  add(rules.ventPerTurn, `-${rules.ventPerTurn}`, 'Heat a turn');
  add(rules.healPerTurn, `+${rules.healPerTurn}`, 'health a turn');
  add(rules.overheatThreshold, `+${rules.overheatThreshold}`, 'overheat line');

  if (gains.length === 0) return null;

  return el('aside', { class: 'gains', 'aria-label': 'What you are carrying adds up to' }, [
    el('h2', { class: 'gains-head' }, ['In total']),
    ...gains.map((gain) =>
      el('div', { class: 'gains-row' }, [
        el('span', { class: 'gains-value' }, [gain.value]),
        el('span', { class: 'gains-label' }, [
          gain.label,
          gain.note === undefined ? null : el('span', { class: 'gains-note' }, [gain.note]),
        ]),
      ]),
    ),
  ]);
}
