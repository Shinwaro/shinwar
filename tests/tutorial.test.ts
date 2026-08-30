/* The introduction.
 *
 * It is a scripted lesson — "play the Block card, now play the one that builds
 * Heat" — and the script only works because the deck is dealt in written order.
 * These pin the two things that would silently break it: the deal order, and
 * the cards the coach names actually arriving in the hand it names them in.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { endTurnVia } from './helpers.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable, enemies as enemyTable } from '../src/content/registry.ts';
import { PLAYER, STANCES } from '../src/content/balance.ts';
import {
  TRAINING_HULK,
  TUTORIAL_BLOCK_CARD,
  TUTORIAL_BURN_CARD,
  TUTORIAL_DECK,
  TUTORIAL_FOCUS_CARD,
  TUTORIAL_NUMBER_CARD,
  TUTORIAL_HEAT_CARD,
  TUTORIAL_SPEND_CARD,
  TUTORIAL_STANCE_CARD,
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

  it('opens on the move the lesson names', () => {
    /* The coach says "it swings for six, and six Block is the whole of it
       absorbed". Every other fight rolls where in its rotation an enemy starts
       — which is the point of that roll — so the introduction has to pin it, or
       the sentence is wrong whenever the hauler opens on Brace or Slam. */
    const enemy = opened().run?.combat?.enemies[0];
    const first = enemyTable.get(TRAINING_HULK).moves[0];
    // The committed intent, not the cursor: the cursor has already stepped past
    // move zero by the time the first telegraph is on screen.
    expect(enemy?.intentMoveId).toBe(first?.id);
    expect(first?.intent[0]).toMatchObject({ kind: 'attack', amount: 6 });
  });

  it('puts the Block and Heat lessons in the opening hand', () => {
    const hand = (opened().run?.combat?.hand ?? []).map((card) => card.defId);
    expect(hand).toHaveLength(PLAYER.drawPerTurn);
    expect(hand, 'the Block lesson').toContain(TUTORIAL_BLOCK_CARD);
    expect(hand, 'the Heat lesson').toContain(TUTORIAL_HEAT_CARD);
  });

  it('puts the three turn-two lessons in the second hand', () => {
    const second = endTurnVia(opened());
    const hand = (second.run?.combat?.hand ?? []).map((card) => card.defId);
    expect(second.run?.combat?.turn).toBe(2);
    expect(hand, 'the stance lesson').toContain(TUTORIAL_STANCE_CARD);
    expect(hand, 'the Focus lesson').toContain(TUTORIAL_FOCUS_CARD);
    expect(hand, 'the Focus spend').toContain(TUTORIAL_SPEND_CARD);
  });

  it('puts the last two lessons in the third hand, with what they need', () => {
    /* The one that would have shipped broken.
     *
     * Turn two draws twice more than it deals — Vector Step draws, and Drawn
     * Breath's IAI rider draws — so two deck positions are swallowed into a
     * hand that discards them. Putting the Burn card at the top of turn three
     * by counting five-card hands is off by exactly those two, and the lesson
     * then asks for a card the player cannot see.
     *
     * The Heat and the Focus are asserted for the same reason. The number
     * lesson only says anything if IAI's bonus is live and a stack survived
     * Meridian Cut, and Heat lands on 5 — the threshold itself, with nothing
     * spare. */
    const third = walkTheScript();
    const hand = (third.run?.combat?.hand ?? []).map((card) => card.defId);
    expect(third.run?.combat?.turn, 'the script should end on turn three').toBe(3);
    expect(hand, 'the Burn lesson').toContain(TUTORIAL_BURN_CARD);
    expect(hand, 'the card the last lesson reads').toContain(TUTORIAL_NUMBER_CARD);
    expect(third.run?.combat?.heat ?? 0, 'IAI pays nothing under 5').toBeGreaterThanOrEqual(
      STANCES.iai.hotDamageAtHeat ?? 5,
    );
    expect(third.run?.combat?.focus ?? 0, 'a stack has to survive the spend').toBeGreaterThan(0);
  });

  /* The script, played the way the coach asks for it. Measured through the real
     engine rather than by adding the numbers printed on the cards: half of what
     these plays do comes from the stance riders and the Focus spend, which no
     amount of reading the card faces will tell you. */
  function walkTheScript(): GameState {
    let state = opened();
    const play = (defId: string): void => {
      const card = state.run?.combat?.hand.find((entry) => entry.defId === defId);
      if (card === undefined) throw new Error(`the lesson asks for ${defId} and it is not in hand`);
      state = applyAction(state, {
        kind: 'playCard',
        cardUid: card.uid,
        targetUid: state.run?.combat?.enemies[0]?.uid ?? null,
      });
    };

    play(TUTORIAL_BLOCK_CARD);
    play(TUTORIAL_HEAT_CARD);
    state = endTurnVia(state);
    play(TUTORIAL_STANCE_CARD);
    play(TUTORIAL_FOCUS_CARD);
    play(TUTORIAL_SPEND_CARD);
    state = endTurnVia(state);
    return state;
  }

  it('leaves the enemy standing for the last step', () => {
    /* This used to assert the opposite, and the opposite was wrong: the last
       word of the tutorial — where the log is, where the Info panel is, "now
       finish it" — came after a fight the script had already ended, so it
       arrived over a reward screen or never arrived at all.

       The enemy outlasts the lesson now. Asserted with room to spare on both
       sides, because a lesson that leaves 1 health is the same bug waiting for
       a stance rider to be retuned. */
    const after = walkTheScript();
    const enemy = after.run?.combat?.enemies[0];
    expect(enemy?.hp ?? 0, 'the script killed its own subject').toBeGreaterThan(4);
  });

  it('leaves a fight the player can actually finish', () => {
    /* The other half. A target that outlasts the lesson and then outlasts the
       deck is a tutorial you cannot complete. */
    const after = walkTheScript();
    const enemy = after.run?.combat?.enemies[0];
    const left = enemy?.hp ?? 0;

    const damageOf = (id: string): number =>
      cardTable
        .get(id)
        .effects.filter((op) => op.op === 'damage')
        .reduce((sum, op) => sum + (op.op === 'damage' ? op.amount : 0), 0);

    const inHand = (after.run?.combat?.hand ?? []).map((card) => card.defId);
    const inDeck = (after.run?.combat?.draw ?? []).map((card) => card.defId);
    const reachable = [...inHand, ...inDeck].reduce((sum, id) => sum + damageOf(id), 0);

    expect(reachable, `${left} health left and nothing to spend on it`).toBeGreaterThan(left);
  });

  it('fits each scripted hand inside a turn of Energy', () => {
    const cost = (id: string): number => Number(cardTable.get(id).cost);
    // Turn one: the Block lesson and the Heat lesson, both in three Energy.
    expect(cost(TUTORIAL_BLOCK_CARD) + cost(TUTORIAL_HEAT_CARD)).toBeLessThanOrEqual(
      PLAYER.energyPerTurn,
    );
    /* Turn two: stance, Focus banked, Focus spent, in three Energy — 0 + 1 + 2.
       There is no slack at all in this line, which is the point of having it,
       and it is why the Burn lesson lives on turn three: Drawn Breath costs the
       Energy that Settle did not. */
    const turnTwo =
      cost(TUTORIAL_STANCE_CARD) + cost(TUTORIAL_FOCUS_CARD) + cost(TUTORIAL_SPEND_CARD);
    expect(turnTwo).toBeLessThanOrEqual(PLAYER.energyPerTurn);
    /* Turn three: the Burn lesson and the card the last step reads. Only the
       first is played — the number step points at the other rather than
       spending it — but both have to be affordable, or a player who plays them
       in the other order is stuck. */
    const turnThree = cost(TUTORIAL_BURN_CARD) + cost(TUTORIAL_NUMBER_CARD);
    expect(turnThree).toBeLessThanOrEqual(PLAYER.energyPerTurn);
  });
});
