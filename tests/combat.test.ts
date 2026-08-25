/* The combat loop: the turn cycle, heat, stance, intents, and the outcomes.
 *
 * The intent tests are the correctness-critical ones. A player who plans
 * around a telegraphed 14 and takes 21 will never trust the game again, so the
 * committed move must survive anything the player does on their turn.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { EnemyAiState, EnemyDef, GameState } from '../src/engine/types.ts';
import { reloadContent } from '../src/content/index.ts';
import { applyAction, applyActions } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import {
  canPlay,
  endTurnImmediately,
  needsTarget,
  playCard,
  startCombat,
  startPlayerTurn,
} from '../src/engine/combat/combat.ts';
import { definitionOf } from '../src/engine/combat/combat.ts';
import { intentOf, telegraphAll } from '../src/engine/combat/intents.ts';
import { roundOwed } from '../src/engine/combat/combat.ts';
import { chooseMove } from '../src/engine/combat/ai.ts';
import { createRng } from '../src/engine/rng.ts';
import { nextStance } from '../src/engine/combat/stance.ts';
import { overheatDamageAt, ventHeat } from '../src/engine/combat/heat.ts';
import { addStacks, clearFresh, decayStatuses, stacksOf } from '../src/engine/combat/keywords.ts';
import { applyEffects, createContext } from '../src/engine/combat/effects.ts';
import { PLAYER as PLAYER_SIDE } from '../src/engine/combat/damage.ts';
import { SCALD, WEAK } from '../src/content/statuses.ts';
import { cards as cardTable, statuses as statusTable } from '../src/content/registry.ts';
import { CLEAR_SPACE_ID } from '../src/content/environments.ts';
import { ACTIVE_STANCES, HEAT, PLAYER, STANCES } from '../src/content/balance.ts';
import { IAI_SLASH, SEVER, SOLAR_PARRY, VECTOR_STEP } from '../src/content/cards/basic.ts';
import { JETTISON } from '../src/content/cards/discard.ts';
import { VULNERABLE } from '../src/content/statuses.ts';
import {
  beginRunInCombat,
  combatOf,
  endTurnVia,
  firstEnemy,
  handCard,
  hullOf,
  makeFight,
} from './helpers.ts';

beforeEach(() => {
  reloadContent();
});

describe('starting a run', () => {
  it('opens on the map, not in a fight', () => {
    const state = applyActions(createInitialState('OPENER'), [{ kind: 'beginRun' }]);
    expect(state.phase).toBe('run');
    expect(state.run?.screen).toBe('map');
    expect(state.run?.combat).toBeNull();
    expect(state.run?.map).not.toBeNull();
    expect(state.run?.position).toBeNull();
  });

  it('walks into the first fight with the starting deck', () => {
    const state = beginRunInCombat('OPENER');
    const combat = combatOf(state);
    expect(combat.enemies.length).toBeGreaterThan(0);
    expect(combat.turn).toBe(1);
    expect(combat.hand.length).toBe(PLAYER.drawPerTurn + STANCES[combat.stance].extraDraw);
    expect(combat.hand.length + combat.draw.length).toBe(PLAYER.startingDeckSize);
  });

  it('gives the same fight for the same seed and a different one otherwise', () => {
    const a = beginRunInCombat('SEED-AAAA');
    const b = beginRunInCombat('SEED-AAAA');
    expect(combatOf(a).hand.map((c) => c.defId)).toEqual(combatOf(b).hand.map((c) => c.defId));
    expect(combatOf(a).encounterId).toBe(combatOf(b).encounterId);
  });
});

describe('intents', () => {
  it('commits the move at telegraph time and does not re-roll when the player acts', () => {
    const state = makeFight({ enemyIds: ['scrap_hound', 'scrap_hound'], hand: [IAI_SLASH, SOLAR_PARRY] });
    const telegraphed = telegraphAll(state);
    const committed = combatOf(telegraphed).enemies.map((enemy) => enemy.intentMoveId);

    let after = playCard(telegraphed, handCard(telegraphed, 0).uid, firstEnemy(telegraphed).uid);
    after = playCard(after, handCard(after, 0).uid, firstEnemy(after).uid);

    expect(combatOf(after).enemies.map((enemy) => enemy.intentMoveId)).toEqual(committed);
  });

  it('shows the number that will actually land, not the raw one', () => {
    // The Lathe Drone's Strike is 5. Vulnerable on the player makes it 7 (5 x
    // 1.5, rounded down), and the telegraph must say 7 — freezing the number
    // instead of the choice is exactly how "it said 5" happens.
    const clean = telegraphAll(makeFight({ enemyIds: ['lathe_drone'] }));
    const vulnerable = telegraphAll(
      makeFight({ enemyIds: ['lathe_drone'], playerStatuses: [{ status: VULNERABLE, stacks: 1, fresh: false }] }),
    );

    expect(intentOf(clean, firstEnemy(clean))[0]?.amount).toBe(5);
    expect(intentOf(vulnerable, firstEnemy(vulnerable))[0]?.amount).toBe(7);
  });

  it('telegraphs multi-hit as times x amount', () => {
    const state = makeFight({ enemyIds: ['scrap_hound'] });
    const telegraphed = telegraphAll(state);
    const hit = intentOf(telegraphed, firstEnemy(telegraphed))[0];
    expect(hit).toBeDefined();
    if (hit?.times === 2) expect(hit.amount).toBe(3);
    else expect(hit?.amount).toBe(11);
  });

  it('runs a sequence script in order, every time', () => {
    // `endPlayerTurn` telegraphs the next move on its way into the new turn,
    // so the loop reads what is already committed rather than telegraphing
    // again — a second telegraph in one turn would be a re-roll.
    let state = startPlayerTurn(makeFight({ enemyIds: ['lathe_drone'], hull: 500 }));
    const seen: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(firstEnemy(state).intentMoveId);
      state = endTurnImmediately(state);
    }
    expect(seen).toEqual(['strike', 'plate', 'press', 'sap', 'strike', 'plate']);
  });

  it('never repeats a weighted move more than its cap', () => {
    let state = startPlayerTurn(makeFight({ enemyIds: ['scrap_hound'], hull: 5000, enemyHp: 5000 }));
    let streak = 0;
    let last: string | null = null;
    for (let i = 0; i < 60; i++) {
      const move = firstEnemy(state).intentMoveId;
      streak = move === last ? streak + 1 : 1;
      last = move;
      expect(streak, `move '${move ?? '-'}' repeated ${streak} times`).toBeLessThanOrEqual(2);
      state = endTurnImmediately(state);
    }
  });
});

describe('the turn cycle', () => {
  it('refills energy, drops block, and draws the stance’s hand', () => {
    const state = makeFight({
      stance: 'iai',
      block: 9,
      energy: 0,
      drawPile: [IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
    });
    const next = startPlayerTurn(state);
    const combat = combatOf(next);
    expect(combat.energy).toBe(PLAYER.energyPerTurn);
    expect(combat.block).toBe(0);
    expect(combat.hand.length).toBe(PLAYER.drawPerTurn + STANCES.iai.extraDraw);
  });

  it('still honours a stance’s extra draw if one is in rotation', () => {
    // FLOW is dormant, but its rules are intact — this is what would have to
    // keep working the day it comes back.
    const state = makeFight({
      stance: 'flow',
      energy: 0,
      drawPile: [IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
    });
    expect(combatOf(startPlayerTurn(state)).hand.length).toBe(PLAYER.drawPerTurn + 1);
  });

  it('lets GUARD keep 3 Block across the turn boundary', () => {
    const state = makeFight({ stance: 'guard', block: 9, drawPile: [IAI_SLASH] });
    expect(combatOf(startPlayerTurn(state)).block).toBe(STANCES.guard.blockRetained);
  });

  it('reshuffles the discard when the draw pile runs dry', () => {
    const state = makeFight({ hand: [IAI_SLASH, SOLAR_PARRY], drawPile: [] });
    const discarded = endTurnImmediately(state);
    const combat = combatOf(discarded);
    // The hand went to discard, then the new turn reshuffled it back to draw.
    expect(combat.hand.length + combat.draw.length + combat.discard.length).toBeGreaterThan(0);
    expect(combat.hand.length).toBeGreaterThan(0);
  });

  it('charges energy and refuses a card it cannot pay for', () => {
    const state = makeFight({ energy: 1, hand: [SEVER] });
    const card = handCard(state, 0);
    expect(canPlay(state, card.uid).ok).toBe(false);
    expect(canPlay(state, card.uid).reason).toMatch(/Needs 2 Energy/);
    expect(playCard(state, card.uid, firstEnemy(state).uid)).toBe(state);
  });
});

describe('drawing', () => {
  it('keeps the hand at five and never loses a card', () => {
    let state = beginRunInCombat('DRAW-TRACE');
    for (let turn = 0; turn < 6; turn++) {
      const combat = combatOf(state);
      if (combat.outcome !== 'ongoing') break;
      const total = combat.hand.length + combat.draw.length + combat.discard.length + combat.exhaust.length;
      expect(total, `turn ${combat.turn} lost or duplicated a card`).toBe(PLAYER.startingDeckSize);
      expect(combat.hand.length).toBe(PLAYER.drawPerTurn + STANCES[combat.stance].extraDraw);
      state = endTurnVia(state);
      if (state.phase !== 'run') break;
    }
  });

  it('says so in the log — a silent draw reads as a broken one', () => {
    const state = beginRunInCombat('DRAW-LOG');
    expect(state.log.some((entry) => /^Drew \d+ cards?\./.test(entry.text))).toBe(true);
  });

  it('names the cards when a card was spent to draw them', () => {
    const state = makeFight({ stance: 'iai', hand: [VECTOR_STEP], drawPile: [SEVER] });
    const after = playCard(state, handCard(state, 0).uid, null);
    expect(after.log.some((entry) => entry.text === 'Drew Sever.')).toBe(true);
  });

  it('announces the reshuffle', () => {
    const state = makeFight({ hand: [IAI_SLASH, SOLAR_PARRY], drawPile: [] });
    const after = endTurnImmediately(state);
    expect(after.log.some((entry) => entry.text.includes('shuffled back into the deck'))).toBe(true);
  });
});

describe('stance', () => {
  it('toggles between the two stances in rotation', () => {
    const iai = makeFight({ stance: 'iai', hand: [VECTOR_STEP], drawPile: [IAI_SLASH] });
    const toGuard = playCard(iai, handCard(iai, 0).uid, null);
    expect(combatOf(toGuard).stance).toBe('guard');

    const guard = makeFight({ stance: 'guard', hand: [VECTOR_STEP], drawPile: [IAI_SLASH] });
    expect(combatOf(playCard(guard, handCard(guard, 0).uid, null)).stance).toBe('iai');
  });

  it('never cycles into a dormant stance', () => {
    for (const from of ACTIVE_STANCES) {
      for (const direction of [1, -1] as const) {
        expect(ACTIVE_STANCES).toContain(nextStance(from, direction));
      }
    }
    expect(ACTIVE_STANCES).not.toContain('flow');
  });

  it('steps a retired stance back into rotation rather than sticking', () => {
    expect(ACTIVE_STANCES).toContain(nextStance('flow', 1));
  });

  it('draws when Vector Step changes stance', () => {
    const state = makeFight({ stance: 'iai', hand: [VECTOR_STEP], drawPile: [IAI_SLASH] });
    const after = playCard(state, handCard(state, 0).uid, null);
    expect(combatOf(after).hand.some((card) => card.defId === IAI_SLASH)).toBe(true);
    expect(combatOf(after).hand.length).toBe(1);
  });

  it('needs no target for a card that aims at nothing', () => {
    const def = (id: string) => definitionOf({ uid: 'x', defId: id, upgraded: false });
    expect(needsTarget(def(VECTOR_STEP), 'guard')).toBe(false);
    expect(needsTarget(def(IAI_SLASH), 'guard')).toBe(true);
  });

  it('only asks a defensive card to be aimed when its rider is live', () => {
    // Solar Parry is pure Block in IAI; only the GUARD rider reaches for an
    // enemy. Aiming it in IAI would be friction with no decision behind it.
    const parry = definitionOf({ uid: 'x', defId: SOLAR_PARRY, upgraded: false });
    expect(needsTarget(parry, 'iai')).toBe(false);
    expect(needsTarget(parry, 'guard')).toBe(true);
  });

  it('cooks you in IAI at the end of the turn', () => {
    const state = makeFight({ stance: 'iai', heat: 0, drawPile: [IAI_SLASH] });
    expect(combatOf(endTurnImmediately(state)).heat).toBe(STANCES.iai.heatAtTurnEnd);
  });

  it('vents in GUARD at the end of the turn', () => {
    const state = makeFight({ stance: 'guard', heat: 5, drawPile: [IAI_SLASH] });
    expect(combatOf(endTurnImmediately(state)).heat).toBe(5 - STANCES.guard.ventAtTurnEnd);
  });
});

describe('innate', () => {
  it('takes a hand slot rather than adding one', () => {
    /* The bug: draw The Witness plus five other cards, for six.

       Innate cards are seated in hand before turn 1 draws, so the draw has to
       come out of the hand size rather than on top of it. It matters most for
       the cards you did not choose — a Voided card's entire cost is occupying
       a slot in every opening hand, and it was occupying nothing. */
    const withInnate = cardTable
      .all()
      .find((card) => card.innate === true && card.type === 'voided');
    expect(withInnate, 'no innate voided card to test with').toBeDefined();

    const state = makeFight();
    const run = state.run!;
    const deck = [
      { uid: 'innate-1', defId: withInnate!.id, upgraded: false },
      ...run.pilot.deck,
    ];

    const opened = startCombat(
      { ...state, run: { ...run, pilot: { ...run.pilot, deck }, combat: null } },
      'hound_pair',
      CLEAR_SPACE_ID,
    );

    const hand = combatOf(opened).hand;
    expect(hand).toHaveLength(PLAYER.drawPerTurn);
    expect(hand.some((card) => card.defId === withInnate!.id), 'the innate is in hand').toBe(true);
  });
});

describe('overheat', () => {
  it('scales its damage with max health rather than a flat number', () => {
    // A flat 3 stops mattering the moment the deck is doing forty a turn,
    // which is why the gauge was never something to think about.
    expect(overheatDamageAt(HEAT.overheatAt - 1, 70)).toBe(0);
    expect(overheatDamageAt(HEAT.overheatAt, 70)).toBeGreaterThan(0);
    // Twice the max health, twice the bite (give or take the rounding).
    expect(overheatDamageAt(HEAT.overheatAt, 140)).toBeGreaterThan(
      overheatDamageAt(HEAT.overheatAt, 70),
    );
    expect(overheatDamageAt(HEAT.max, 70)).toBeGreaterThan(overheatDamageAt(HEAT.overheatAt, 70));
  });

  it('burns a card and takes health at the threshold', () => {
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.overheatAt + STANCES.guard.ventAtTurnEnd,
      hand: [IAI_SLASH, IAI_SLASH],
      drawPile: [SOLAR_PARRY],
    });
    const before = hullOf(state);
    const after = endTurnImmediately(state);
    expect(hullOf(after)).toBeLessThan(before);
    expect(combatOf(after).exhaust.length).toBe(1);
  });

  it('takes the next turn, and blows the gauge back to zero doing it', () => {
    // The turn is the real cost. The reset is what stops an overheat at 10 in
    // IAI walking straight into another one with no turn in between.
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.overheatAt + STANCES.guard.ventAtTurnEnd,
      hand: [IAI_SLASH],
      drawPile: [SOLAR_PARRY, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
      hull: 500,
    });
    const after = endTurnImmediately(state);
    expect(combatOf(after).heat).toBe(HEAT.min);
    // The skipped turn is spent by the time control comes back.
    expect(combatOf(after).skipNextTurn).toBe(false);
  });

  it('costs energy on the vent turn at critical', () => {
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.criticalAt + STANCES.guard.ventAtTurnEnd,
      hand: [IAI_SLASH],
      drawPile: [SOLAR_PARRY, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
      hull: 500,
    });
    const after = endTurnImmediately(state);
    // The vent turn hands you no Energy at all — that is the cost — and the
    // critical penalty lands on the turn after it.
    expect(combatOf(after).energy).toBe(0);
  });

  it('takes the turn when a status ticks you into the ceiling', () => {
    /* The bug, exactly as it was hit: start a turn on full Heat with Scald
       running, and play a whole hand anyway.

       `playCard` had ended the turn at the ceiling since M3, so the rule
       existed for cards and only for cards. Nothing checked after the turn's
       status tick, so a Scald could put you at the top of the gauge before you
       had moved and hand you a free turn with nothing left to lose — the exact
       opposite of what the ceiling is for. */
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.criticalAt - 2,
      playerStatuses: [{ status: SCALD, stacks: 3, fresh: false }],
      hand: [IAI_SLASH],
      drawPile: [SOLAR_PARRY, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
      hull: 500,
    });

    const opened = startPlayerTurn(state);
    // Scald pushed it over, so the turn is already gone: the player never gets
    // to act, and the enemies are queued.
    expect(combatOf(opened).pendingEnemies.length).toBeGreaterThan(0);
  });

  it('does not take the turn on a reactor-vent turn', () => {
    /* The vent turn already blows the gauge to zero, and it is already the
       punishment for the last overheat. Reading the Heat before that clears
       would charge for the same overheat twice — which is what the first
       version of the ceiling check did. */
    const state = makeFight({ stance: 'guard', heat: HEAT.criticalAt, hand: [IAI_SLASH], hull: 500 });
    const skipping = {
      ...state,
      run: { ...state.run!, combat: { ...combatOf(state), skipNextTurn: true } },
    };

    const opened = startPlayerTurn(skipping);
    expect(combatOf(opened).heat).toBe(0);
    expect(combatOf(opened).pendingEnemies.length).toBe(0);
  });

  it('lets IAI’s own passive tip you over', () => {
    // At 7 you are safe. IAI's Heat at end of turn puts you over, and the check
    // runs after the passive — that is the bargain IAI offers.
    const cool = makeFight({ stance: 'iai', heat: 0, hand: [IAI_SLASH], drawPile: [SOLAR_PARRY], hull: 500 });
    const hot = makeFight({ stance: 'iai', heat: 7, hand: [IAI_SLASH], drawPile: [SOLAR_PARRY], hull: 500 });

    const settledCool = endTurnImmediately(cool);
    const settledHot = endTurnImmediately(hot);

    // The hot run pays on both counts: the overheat itself, and then a whole
    // extra enemy turn taken while the reactor vents. That second cost is why
    // the difference here is larger than the damage number alone.
    const coolLost = hullOf(cool) - hullOf(settledCool);
    const hotLost = hullOf(hot) - hullOf(settledHot);
    expect(hotLost).toBeGreaterThanOrEqual(
      coolLost + overheatDamageAt(7 + STANCES.iai.heatAtTurnEnd, 70),
    );
    // And it comes out the far side cold, rather than straight into another one.
    expect(combatOf(settledHot).heat).toBe(HEAT.min);
  });
});

describe('statuses across the round boundary', () => {
  it('gives an enemy debuff on the player a turn to actually matter', () => {
    // The bug this exists to stop: decay runs at the end of the round, after
    // the enemies have moved, so a debuff applied during the enemy phase used
    // to be stripped in the same breath. It was applied, logged, and gone
    // before the player took a single turn under it — every enemy debuff in
    // the game was doing nothing.
    //
    // The Lathe Drone runs a fixed strike/plate/sap cycle, and Sap is Weak.
    let next = makeFight({ enemyIds: ['lathe_drone'], enemyHp: 999, hull: 999 });
    let landed = false;

    for (let round = 0; round < 6 && !landed; round++) {
      next = endTurnImmediately(next);
      landed = combatOf(next).statuses.some((held) => held.status === WEAK);
    }

    expect(landed, 'Sap never landed').toBe(true);
    // And it is still there when control comes back, which is the whole point.
    expect(combatOf(next).statuses.find((held) => held.status === WEAK)?.stacks).toBe(1);
  });

  it('clears the stack once the holder has had its turn', () => {
    const held = addStacks([], WEAK, 1);
    expect(held[0]?.fresh, 'a new stack is fresh').toBe(true);

    // Fresh survives one decay — that is the round it was applied in.
    expect(decayStatuses(held)[0]?.stacks).toBe(1);

    // Once the holder acts it is no longer new, and the next decay takes it.
    const acted = clearFresh(held);
    expect(acted[0]?.fresh).toBe(false);
    expect(decayStatuses(acted)).toEqual([]);
  });

  it('does not let a decay refresh its own target', () => {
    // Subtracting must never mark the entry fresh, or a two-stack debuff would
    // never finish decaying.
    const two = clearFresh(addStacks([], WEAK, 2));
    const once = decayStatuses(two);
    expect(once[0]?.stacks).toBe(1);
    expect(once[0]?.fresh).toBe(false);
    expect(decayStatuses(once)).toEqual([]);
  });
});

describe('outcomes', () => {
  it('wins when the last enemy dies, and offers a reward', () => {
    const state = makeFight({ hand: [SEVER], enemyHp: 5, energy: 3 });
    const after = applyAction(state, {
      kind: 'playCard',
      cardUid: handCard(state, 0).uid,
      targetUid: firstEnemy(state).uid,
    });
    expect(after.phase).toBe('run');
    expect(after.run?.combat).toBeNull();
    expect(after.run?.screen).toBe('reward');
    expect(after.run?.pendingReward).not.toBeNull();
  });

  it('loses when hull reaches zero', () => {
    const state = makeFight({ enemyIds: ['scrap_hound'], hull: 3, hand: [], drawPile: [IAI_SLASH] });
    const after = endTurnVia(telegraphAll(state));
    expect(hullOf(after)).toBe(0);
    expect(after.run?.outcome).toBe('died');
    expect(after.phase).toBe('over');
  });

  it('ignores combat actions once the fight is over', () => {
    const state = makeFight({ hand: [SEVER], enemyHp: 5 });
    const won = applyAction(state, {
      kind: 'playCard',
      cardUid: handCard(state, 0).uid,
      targetUid: firstEnemy(state).uid,
    });
    expect(applyAction(won, { kind: 'endTurn' })).toBe(won);
  });
});

/* ---------- phased bosses ---------- */

describe('a phased boss', () => {
  /* The escalation is data — a threshold and two move lists — so these tests
     go through `chooseMove` directly rather than through a whole fight. What
     they are protecting is that the switch happens on the right side of the
     line, restarts the second list from its beginning, and never re-rolls a
     move that has already been telegraphed. */

  const DEF: EnemyDef = {
    id: 'test_phased' as EnemyDef['id'],
    name: 'Test',
    maxHp: 100,
    act: 1,
    tier: 'boss',
    moves: [
      { id: 'a', label: 'A', intent: [], effects: [] },
      { id: 'b', label: 'B', intent: [], effects: [] },
      { id: 'c', label: 'C', intent: [], effects: [] },
    ],
    script: { kind: 'phased', threshold: 40, opening: ['a', 'b'], closing: ['c'] },
    flavor: '',
  };

  const fresh: EnemyAiState = { moveIndex: 0, lastMoveId: null, repeats: 0 };

  it('cycles the opening list above the threshold', () => {
    let ai = fresh;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const choice = chooseMove(DEF, ai, createRng('phase'), 100);
      ai = choice.ai;
      seen.push(choice.move.id);
    }
    expect(seen).toEqual(['a', 'b', 'a', 'b']);
  });

  it('switches at the threshold, not one point either side of it', () => {
    const above = chooseMove(DEF, fresh, createRng('phase'), 40.5);
    const at = chooseMove(DEF, fresh, createRng('phase'), 40);
    const below = chooseMove(DEF, fresh, createRng('phase'), 39.5);
    expect(above.move.id).toBe('a');
    // At exactly the threshold the second phase is already running: the
    // comparison is `<=`, so a boss brought to exactly 40% has crossed.
    expect(at.move.id).toBe('c');
    expect(below.move.id).toBe('c');
  });

  it('restarts the closing list rather than continuing the running index', () => {
    /* The bug this exists to prevent: carry `moveIndex` across the flip and a
       two-move closing list starts on its second move about half the time, so
       the escalation reads as noise instead of as a change. */
    const wide: EnemyDef = {
      ...DEF,
      script: { kind: 'phased', threshold: 40, opening: ['a'], closing: ['b', 'c'] },
    };
    let ai = fresh;
    for (let i = 0; i < 5; i++) ai = chooseMove(wide, ai, createRng('phase'), 100).ai;
    expect(ai.moveIndex % 2).toBe(1);

    const first = chooseMove(wide, ai, createRng('phase'), 20);
    expect(first.move.id).toBe('b');
    expect(chooseMove(wide, first.ai, createRng('phase'), 20).move.id).toBe('c');
  });

  it('does not restart every turn once the phase is running', () => {
    const wide: EnemyDef = {
      ...DEF,
      script: { kind: 'phased', threshold: 40, opening: ['a'], closing: ['b', 'c'] },
    };
    let ai = fresh;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const choice = chooseMove(wide, ai, createRng('phase'), 10);
      ai = choice.ai;
      seen.push(choice.move.id);
    }
    expect(seen).toEqual(['b', 'c', 'b', 'c']);
  });

  it('spends nothing from the combat stream', () => {
    // A fixed list is not a choice, so it must not move the generator — or
    // adding a phase to a boss would shift every roll in every fight after it.
    const rng = createRng('phase');
    const choice = chooseMove(DEF, fresh, rng, 100);
    expect(choice.rng).toEqual(rng);
  });
});

describe('the gap between the last blow and your turn', () => {
  /* Starting the turn is what drops Block to whatever the stance retains, and
     it used to happen in the same step as the last enemy's blow. So the shield
     was already gone before the number for the hit it had just absorbed was
     drawn — the armour appeared to give up a beat early, every turn, in every
     fight.

     The UI had a display-level hack holding the old number on screen. A label
     that disagrees with the state is a bug waiting for its second reader, so
     the gap is real now: the round stays open, and closing it is its own
     action the UI dispatches once the blow has been shown. */

  it('leaves the round owed once every enemy has swung', () => {
    // Telegraphed first: an enemy with no committed move is never queued, and
    // then there is no last blow for the round to be waiting on.
    let state = applyAction(telegraphAll(makeFight({ enemyIds: ['cinder_wisp'], block: 12 })), {
      kind: 'endTurn',
    });
    let guard = 0;
    while (guard++ < 16 && combatOf(state).pendingEnemies.length > 0) {
      state = applyAction(state, { kind: 'advanceEnemies' });
    }

    expect(roundOwed(state), 'the round closed itself').toBe(true);
    // Still the player's old turn number: the next one has not begun.
    expect(combatOf(state).turn).toBe(1);
  });

  it('keeps the Block that did the absorbing until the round closes', () => {
    let state = applyAction(telegraphAll(makeFight({ enemyIds: ['cinder_wisp'], block: 40 })), {
      kind: 'endTurn',
    });
    let guard = 0;
    while (guard++ < 16 && combatOf(state).pendingEnemies.length > 0) {
      state = applyAction(state, { kind: 'advanceEnemies' });
    }

    // Whatever the blow ate, the rest is still standing — the stance has not
    // had its say yet.
    const held = combatOf(state).block;
    expect(held, 'Block was reset before the round closed').toBeGreaterThan(3);

    const closed = applyAction(state, { kind: 'closeRound' });
    expect(combatOf(closed).turn).toBe(2);
    expect(combatOf(closed).block, 'the stance never got its say').toBeLessThan(held);
  });

  it('refuses to close a round that is not owed', () => {
    // A stray dispatch must not start a second turn on top of the first.
    const fresh = makeFight({ enemyIds: ['cinder_wisp'] });
    expect(roundOwed(fresh)).toBe(false);
    expect(applyAction(fresh, { kind: 'closeRound' })).toBe(fresh);
  });

  it('closes it anyway for anything not watching', () => {
    // The simulator and the tests have no floaters to wait for.
    const settled = endTurnImmediately(telegraphAll(makeFight({ enemyIds: ['cinder_wisp'] })));
    expect(roundOwed(settled)).toBe(false);
    if (combatOf(settled).outcome === 'ongoing') expect(combatOf(settled).turn).toBe(2);
  });
});

describe('a card in play is in no pile', () => {
  /* The played card used to go straight to the DISCARD before its own effects
     ran, with a comment claiming that stopped it drawing or discarding itself.
     It stopped the first two and not the third.

     A card that discards your hand and then draws empties the discard back into
     the deck to do it — and the played card was sitting in that discard. The
     reshuffle swept it into the draw pile and the draw dealt it back into the
     hand. It was then exhausted out of the hand, so the final state was correct
     and the FIGHT looked like Exhaust was broken: the card you had just spent
     appeared again and vanished again, and the log said so out loud —
     "Discarded 3. Discard shuffled back into the deck. Drew Jettison."

     Held out of every pile while it resolves now, and placed once at the end. */

  it('cannot be shuffled back and drawn by its own draw', () => {
    const state = makeFight({
      enemyHp: 999,
      hand: [JETTISON, IAI_SLASH, SOLAR_PARRY, SEVER],
      energy: 9,
    });
    const played = combatOf(state).hand[0];
    if (played === undefined) throw new Error('test: no card');

    const before = state.log.length;
    const after = playCard(state, played.uid, firstEnemy(state).uid);
    const combat = combatOf(after);

    // The reshuffle really did happen — otherwise this proves nothing.
    const lines = after.log.slice(before).map((entry) => entry.text);
    expect(lines.some((line) => /shuffled back/i.test(line)), 'no reshuffle in this fixture').toBe(
      true,
    );

    expect(lines.filter((line) => /Drew Jettison/i.test(line)), 'drew itself').toEqual([]);
    expect(combat.hand.some((card) => card.uid === played.uid), 'back in hand').toBe(false);
    expect(combat.draw.some((card) => card.uid === played.uid), 'back in the deck').toBe(false);
    expect(combat.discard.some((card) => card.uid === played.uid), 'in the discard').toBe(false);
    expect(combat.exhaust.map((card) => card.uid)).toContain(played.uid);
  });

  it('lands in exactly one pile, for every card in the game', () => {
    /* The general form, because the bug was one card away from being invisible:
       whatever a card does while resolving, when it is finished it is in the
       discard or the exhaust and never both, never neither, and never twice. */
    for (const def of cardTable.all()) {
      if (def.type === 'voided') continue;
      const state = makeFight({
        enemyIds: ['scrap_hound', 'cinder_wisp'],
        enemyHp: 999,
        hand: [def.id, IAI_SLASH, SOLAR_PARRY],
        energy: 9,
      });
      const played = combatOf(state).hand[0];
      if (played === undefined) throw new Error('test: no card');

      const after = playCard(state, played.uid, firstEnemy(state).uid);
      const combat = after.run?.combat;
      if (combat === null || combat === undefined) continue; // the fight ended on it

      const where = (['hand', 'draw', 'discard', 'exhaust'] as const).filter((pile) =>
        combat[pile].some((card) => card.uid === played.uid),
      );
      expect(where, `${def.id} ended up in ${where.join('+') || 'nowhere'}`).toHaveLength(1);
      expect(['discard', 'exhaust'], `${def.id}`).toContain(where[0]);

      const copies = [...combat.hand, ...combat.draw, ...combat.discard, ...combat.exhaust].filter(
        (card) => card.uid === played.uid,
      );
      expect(copies, `${def.id} exists twice`).toHaveLength(1);
    }
  });
});

describe('Scald, and the way out of it', () => {
  /* Scald never decays — that is the point of it, and it was also the whole
     problem. In a long fight it stacked into a second overheat clock the player
     could not touch, and the only counterplay was ending the fight before the
     arithmetic did.

     A vent worth the name sheds a stack. It is the right counterplay because it
     is the same resource the status attacks: answering Scald costs you the
     cards you would rather have spent on damage. */

  function scalded(stacks: number, heat: number): GameState {
    return makeFight({
      heat,
      playerStatuses: [{ status: SCALD, stacks, fresh: false }],
    });
  }

  it('sheds a stack when the vent is big enough', () => {
    const before = scalded(3, 8);
    const after = ventHeat(before, 2, 'test');
    expect(stacksOf(combatOf(after).statuses, SCALD)).toBe(2);
  });

  it('leaves it alone when the vent is small', () => {
    const after = ventHeat(scalded(3, 8), 1, 'test');
    expect(stacksOf(combatOf(after).statuses, SCALD)).toBe(3);
  });

  it('measures what was actually vented, not what was asked for', () => {
    /* Venting 4 against a gauge holding 1 is a vent of 1. Without this the
       counterplay would be "hold a big vent and fire it at zero Heat", which
       costs nothing and unwinds the status for free. */
    const after = ventHeat(scalded(3, 1), 4, 'test');
    expect(combatOf(after).heat).toBe(0);
    expect(stacksOf(combatOf(after).statuses, SCALD)).toBe(3);
  });

  it('sheds one stack per vent, however large', () => {
    // It should cost turns to unwind, not evaporate on the right card.
    const after = ventHeat(scalded(4, 10), 9, 'test');
    expect(stacksOf(combatOf(after).statuses, SCALD)).toBe(3);
  });

  it('can be vented off the turn it lands', () => {
    /* `fresh` stops a status decaying on the turn it arrives, so a debuff
       always costs its victim at least one turn. That guard is about PASSIVE
       decay and deliberately does not cover this: the vent is a counterplay the
       player pays a card for, and taking Scald 2 then venting 4 to no effect
       would read as the game ignoring the answer it just asked for.

       Asserted both ways so the distinction is on the record rather than an
       accident of which flag the shed happens to read. */
    for (const fresh of [true, false]) {
      const state = makeFight({
        heat: 8,
        playerStatuses: [{ status: SCALD, stacks: 3, fresh }],
      });
      expect(stacksOf(combatOf(ventHeat(state, 2, 'test')).statuses, SCALD), `fresh=${fresh}`).toBe(
        2,
      );
    }
  });

  it('cannot be given and taken back by the same card', () => {
    /* Over a turn the trade is real: a card hands you Scald 2, a later card
       vents it back down, and you spent a card doing it. Inside ONE card the
       two halves cancel — the player pays nothing and the debuff never happens,
       which is not a decision, it is a printing error.

       So a vent stops shedding once the same play has applied something a vent
       would shed. Order does not save it either: it is the play that is
       marked, not the op that follows. */
    const state = scalded(1, 8);
    const result = applyEffects(
      state,
      [
        { op: 'applyStatus', status: SCALD, stacks: 2, target: 'self' },
        { op: 'ventHeat', amount: 3 },
      ],
      createContext('test_card', PLAYER_SIDE, null),
    );
    expect(stacksOf(combatOf(result.state).statuses, SCALD)).toBe(3);
    expect(combatOf(result.state).heat).toBe(5);
  });

  it('still sheds for a card that only vents', () => {
    // The guard is about a card undoing itself, not about vents in general.
    const state = scalded(3, 8);
    const result = applyEffects(
      state,
      [{ op: 'ventHeat', amount: 3 }],
      createContext('test_card', PLAYER_SIDE, null),
    );
    expect(stacksOf(combatOf(result.state).statuses, SCALD)).toBe(2);
  });

  it('says so on the status itself', () => {
    // The rule is on the thing it applies to, where a player reading the debuff
    // will find it — not only in a patch note.
    expect(statusTable.get(SCALD).text).toMatch(/vent/i);
    expect(statusTable.get(SCALD).shedOnVent).toBe(2);
  });

  it('touches nothing that did not ask for it', () => {
    const state = makeFight({
      heat: 8,
      playerStatuses: [
        { status: SCALD, stacks: 2, fresh: false },
        { status: WEAK, stacks: 2, fresh: false },
      ],
    });
    const after = ventHeat(state, 3, 'test');
    expect(stacksOf(combatOf(after).statuses, SCALD)).toBe(1);
    expect(stacksOf(combatOf(after).statuses, WEAK), 'Weak declares no shedOnVent').toBe(2);
  });
});
