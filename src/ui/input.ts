/* Keyboard.
 *
 * Number keys play cards, E ends the turn, Tab cycles targets, L toggles the
 * log, Esc deselects. The keyboard is a first-class route to every action, not
 * a convenience layer over the mouse — everything here has a visible control
 * too, and every control here is a real `<button>`.
 *
 * P (pause) is deliberately absent until M2 brings the pause screen.
 */

import type { GameState } from '../engine/types.ts';
import { canPlay, definitionOf, needsTarget } from '../engine/combat/combat.ts';
import { livingEnemies } from '../engine/combat/damage.ts';

export interface CombatSelection {
  cardUid: string | null;
  hoverUid: string | null;
  focusUid: string | null;
  logOpen: boolean;
}

export interface CombatKeyBindings {
  getState(): GameState;
  getSelection(): CombatSelection;
  setSelection(next: Partial<CombatSelection>): void;
  play(cardUid: string, targetUid: string | null): void;
  endTurn(): void;
}

/** Typing in a field must never fire a game shortcut. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export function bindCombatKeys(bindings: CombatKeyBindings): () => void {
  function onKeyDown(event: KeyboardEvent): void {
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

    const state = bindings.getState();
    const combat = state.run?.combat ?? null;
    if (combat === null || combat.outcome !== 'ongoing') return;

    const selection = bindings.getSelection();
    const alive = livingEnemies(combat);

    /* Esc — put the card back down. */
    if (event.key === 'Escape') {
      if (selection.cardUid === null) return;
      event.preventDefault();
      bindings.setSelection({ cardUid: null, hoverUid: null });
      return;
    }

    /* E — end the turn. */
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      bindings.endTurn();
      return;
    }

    /* L — the log. */
    if (event.key.toLowerCase() === 'l') {
      event.preventDefault();
      bindings.setSelection({ logOpen: !selection.logOpen });
      return;
    }

    /* Tab — cycle targets, but only while a card is up. Otherwise leave Tab
       alone: stealing it would break normal focus traversal of the screen. */
    if (event.key === 'Tab' && selection.cardUid !== null && alive.length > 1) {
      event.preventDefault();
      const index = alive.findIndex((enemy) => enemy.uid === selection.focusUid);
      const step = event.shiftKey ? -1 : 1;
      const next = alive[(((index + step) % alive.length) + alive.length) % alive.length];
      bindings.setSelection({ focusUid: next?.uid ?? null });
      return;
    }

    /* Enter/Space with a card up — commit at the focused target. */
    if ((event.key === 'Enter' || event.key === ' ') && selection.cardUid !== null) {
      event.preventDefault();
      bindings.play(selection.cardUid, selection.focusUid);
      return;
    }

    /* 1-9 — play the nth card. */
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
      const card = combat.hand[digit - 1];
      if (card === undefined || !canPlay(state, card.uid).ok) return;
      event.preventDefault();

      const def = definitionOf(card);
      if (!needsTarget(def)) {
        bindings.play(card.uid, null);
        return;
      }
      // Needs a target: pick it up and aim at the first living enemy, so a
      // pure-keyboard player never has to reach for the mouse to disambiguate.
      bindings.setSelection({
        cardUid: card.uid,
        focusUid: selection.focusUid ?? alive[0]?.uid ?? null,
      });
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
