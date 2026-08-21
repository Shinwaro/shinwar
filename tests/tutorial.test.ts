/* The introduction.
 *
 * It is a scripted lesson — "play the Block card, now play the one that builds
 * Heat" — and the script only works because the deck is dealt in written order.
 * These pin the two things that would silently break it: the deal order, and
 * the cards the coach names actually arriving in the hand it names them in.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { endTurnVia } from './helpers.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable, enemies as enemyTable } from '../src/content/registry.ts';
import { PLAYER } from '../src/content/balance.ts';
import {
  TRAINING_HULK,
  TUTORIAL_BLOCK_CARD,
  TUTORIAL_DECK,
  TUTORIAL_FOCUS_CARD,
  TUTORIAL_HEAT_CARD,
} from '../src/content/tutorial.ts';

beforeEach(() => {
  reloadContent();
});

function opened() {
  return applyAction(createInitialState('TUTORIAL'), { kind: 'beginTutorial' });
}

describe('the introduction', () => {
  it('opens straight into its own fight', () => {
    const state = opened();
    expect(state.phase).toBe('run');
    expect(state.run?.tutorial).toBe(true);
    expect(state.run?.screen).toBe('combat');
    expect(state.run?.combat?.enemies.map((enemy) => enemy.defId)).toEqual([TRAINING_HULK]);
  });

  it('deals the deck in written order, unshuffled', () => {
    /* The lesson points at named cards. A shuffle turns that into a lottery,
       so the introduction — and only the introduction — skips it. */
    const combat = opened().run?.combat;
    const dealt = [...(combat?.hand ?? []), ...(combat?.draw ?? [])].map((card) => card.defId);
    expect(dealt).toEqual([...TUTORIAL_DECK]);
  });

  it('puts the Block and Heat lessons in the opening hand', () => {
    const hand = (opened().run?.combat?.hand ?? []).map((card) => card.defId);
    expect(hand).toHaveLength(PLAYER.drawPerTurn);
    expect(hand, 'the Block lesson').toContain(TUTORIAL_BLOCK_CARD);
    expect(hand, 'the Heat lesson').toContain(TUTORIAL_HEAT_CARD);
  });

  it('puts the Focus lesson in the second hand', () => {
    const second = endTurnVia(opened());
    const hand = (second.run?.combat?.hand ?? []).map((card) => card.defId);
    expect(second.run?.combat?.turn).toBe(2);
    expect(hand, 'the Focus lesson').toContain(TUTORIAL_FOCUS_CARD);
  });

  it('is short enough to finish inside the lesson', () => {
    /* Turn one plays Sever; turn two has to be able to finish what is left, or
       the introduction outlasts its own explanation. */
    const hulk = enemyTable.get(TRAINING_HULK);
    const damageOf = (id: string): number =>
      cardTable
        .get(id)
        .effects.filter((op) => op.op === 'damage')
        .reduce((sum, op) => sum + (op.op === 'damage' ? op.amount : 0), 0);

    const turnOne = damageOf(TUTORIAL_HEAT_CARD);
    const turnTwo = damageOf(TUTORIAL_FOCUS_CARD) + damageOf('meridian_cut');
    expect(turnOne + turnTwo).toBeGreaterThanOrEqual(hulk.maxHp);
  });

  it('fits each scripted hand inside a turn of Energy', () => {
    const cost = (id: string): number => Number(cardTable.get(id).cost);
    // Turn one: the Block lesson and the Heat lesson, both in three Energy.
    expect(cost(TUTORIAL_BLOCK_CARD) + cost(TUTORIAL_HEAT_CARD)).toBeLessThanOrEqual(
      PLAYER.energyPerTurn,
    );
    // Turn two: the Focus lesson plus the finisher.
    expect(cost(TUTORIAL_FOCUS_CARD) + cost('meridian_cut')).toBeLessThanOrEqual(
      PLAYER.energyPerTurn,
    );
  });
});
