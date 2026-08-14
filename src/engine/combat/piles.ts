/* Draw, hand, discard, exhaust.
 *
 * All four are plain arrays in `CombatState`, and every move between them
 * happens here so the reshuffle rule lives in exactly one place: when the draw
 * pile runs dry mid-draw, the discard is shuffled back on the `combat` stream
 * and drawing continues.
 */

import type { CardInstance, CombatState, GameState, RngState } from '../types.ts';
import { shuffle } from '../rng.ts';
import { appendLog } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { cards as cardTable } from '../../content/registry.ts';

export interface PileResult {
  readonly combat: CombatState;
  readonly rng: RngState;
  /** What actually moved, for the log and for `onCardDrawn`. */
  readonly moved: readonly CardInstance[];
  /** Whether the discard had to be shuffled back. The player should be told. */
  readonly reshuffled: boolean;
}

/**
 * Draw `count` cards. Reshuffles the discard on the `combat` stream when the
 * draw pile empties. If both piles are empty the draw simply stops short —
 * that is a real state and it must not throw.
 */
export function draw(combat: CombatState, rng: RngState, count: number): PileResult {
  let drawPile = combat.draw.slice();
  let discard = combat.discard.slice();
  const hand = combat.hand.slice();
  const moved: CardInstance[] = [];
  let currentRng = rng;
  let reshuffled = false;

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discard.length === 0) break;
      const rolled = shuffle(currentRng, 'combat', discard);
      drawPile = rolled.value;
      currentRng = rolled.rng;
      discard = [];
      reshuffled = true;
    }
    const card = drawPile.shift();
    if (card === undefined) break;
    hand.push(card);
    moved.push(card);
  }

  return {
    combat: { ...combat, draw: drawPile, discard, hand },
    rng: currentRng,
    moved,
    reshuffled,
  };
}

/**
 * Narrate a draw and fire `onCardDrawn` for each card.
 *
 * A draw that leaves no trace in the log is indistinguishable from a draw that
 * never happened — which is exactly how a working mechanic reads as broken.
 * Turn-start draws report a count; a draw the player spent a card on names the
 * cards, because that is the thing they paid for and want to see land.
 */
export function narrateDraw(
  state: GameState,
  result: PileResult,
  source: string,
  nameCards: boolean,
): GameState {
  let next = state;

  if (result.reshuffled) {
    next = appendLog(next, {
      source: 'system',
      kind: 'card',
      text: 'Discard shuffled back into the deck.',
      detail: null,
    });
  }

  if (result.moved.length > 0) {
    const names = result.moved.map((card) => cardTable.find(card.defId)?.name ?? card.defId);
    next = appendLog(next, {
      source,
      kind: 'card',
      text: nameCards
        ? `Drew ${names.join(', ')}.`
        : `Drew ${result.moved.length} card${result.moved.length === 1 ? '' : 's'}.`,
      detail: { count: result.moved.length },
    });
  }

  for (const card of result.moved) {
    next = fireHook(next, 'onCardDrawn', { cardUid: card.uid, cardId: card.defId });
  }

  return next;
}

export function discardHand(combat: CombatState): CombatState {
  if (combat.hand.length === 0) return combat;
  return { ...combat, hand: [], discard: [...combat.discard, ...combat.hand] };
}

export function moveToDiscard(combat: CombatState, card: CardInstance): CombatState {
  return {
    ...combat,
    hand: combat.hand.filter((entry) => entry.uid !== card.uid),
    discard: [...combat.discard, card],
  };
}

export function moveToExhaust(combat: CombatState, card: CardInstance): CombatState {
  return {
    ...combat,
    hand: combat.hand.filter((entry) => entry.uid !== card.uid),
    exhaust: [...combat.exhaust, card],
  };
}

export function removeFromHand(combat: CombatState, uid: string): CombatState {
  return { ...combat, hand: combat.hand.filter((entry) => entry.uid !== uid) };
}

export function findInHand(combat: CombatState, uid: string): CardInstance | undefined {
  return combat.hand.find((entry) => entry.uid === uid);
}

/** Pick `count` cards from hand at random on the `combat` stream — overheat burns these. */
export function randomFromHand(
  combat: CombatState,
  rng: RngState,
  count: number,
): { readonly picked: readonly CardInstance[]; readonly rng: RngState } {
  if (combat.hand.length === 0) return { picked: [], rng };
  const rolled = shuffle(rng, 'combat', combat.hand);
  return { picked: rolled.value.slice(0, count), rng: rolled.rng };
}
