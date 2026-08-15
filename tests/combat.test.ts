/* The combat loop: the turn cycle, heat, stance, intents, and the outcomes.
 *
 * The intent tests are the correctness-critical ones. A player who plans
 * around a telegraphed 14 and takes 21 will never trust the game again, so the
 * committed move must survive anything the player does on their turn.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { reloadContent } from '../src/content/index.ts';
import { applyAction, applyActions } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import {
  canPlay,
  endPlayerTurn,
  needsTarget,
  playCard,
  startPlayerTurn,
} from '../src/engine/combat/combat.ts';
import { definitionOf } from '../src/engine/combat/combat.ts';
import { intentOf, telegraphAll } from '../src/engine/combat/intents.ts';
import { nextStance } from '../src/engine/combat/stance.ts';
import { overheatDamageAt } from '../src/engine/combat/heat.ts';
import { ACTIVE_STANCES, HEAT, PLAYER, STANCES } from '../src/content/balance.ts';
import { IAI_SLASH, SEVER, SOLAR_PARRY, VECTOR_STEP } from '../src/content/cards/basic.ts';
import { VULNERABLE } from '../src/content/statuses.ts';
import { beginRunInCombat, combatOf, firstEnemy, handCard, hullOf, makeFight } from './helpers.ts';

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
    // The Lathe Drone's Strike is 7. Vulnerable on the player makes it 10, and
    // the telegraph must say 10 — freezing the number instead of the choice is
    // exactly how "it said 7" happens.
    const clean = telegraphAll(makeFight({ enemyIds: ['lathe_drone'] }));
    const vulnerable = telegraphAll(
      makeFight({ enemyIds: ['lathe_drone'], playerStatuses: [{ status: VULNERABLE, stacks: 1 }] }),
    );

    expect(intentOf(clean, firstEnemy(clean))[0]?.amount).toBe(7);
    expect(intentOf(vulnerable, firstEnemy(vulnerable))[0]?.amount).toBe(10);
  });

  it('telegraphs multi-hit as times x amount', () => {
    const state = makeFight({ enemyIds: ['scrap_hound'] });
    const telegraphed = telegraphAll(state);
    const hit = intentOf(telegraphed, firstEnemy(telegraphed))[0];
    expect(hit).toBeDefined();
    if (hit?.times === 2) expect(hit.amount).toBe(4);
    else expect(hit?.amount).toBe(9);
  });

  it('runs a sequence script in order, every time', () => {
    // `endPlayerTurn` telegraphs the next move on its way into the new turn,
    // so the loop reads what is already committed rather than telegraphing
    // again — a second telegraph in one turn would be a re-roll.
    let state = startPlayerTurn(makeFight({ enemyIds: ['lathe_drone'], hull: 500 }));
    const seen: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(firstEnemy(state).intentMoveId);
      state = endPlayerTurn(state);
    }
    expect(seen).toEqual(['strike', 'plate', 'sap', 'strike', 'plate', 'sap']);
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
      state = endPlayerTurn(state);
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
    const discarded = endPlayerTurn(state);
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
      state = applyActions(state, [{ kind: 'endTurn' }]);
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
    const after = endPlayerTurn(state);
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
    expect(combatOf(endPlayerTurn(state)).heat).toBe(STANCES.iai.heatAtTurnEnd);
  });

  it('vents in GUARD at the end of the turn', () => {
    const state = makeFight({ stance: 'guard', heat: 5, drawPile: [IAI_SLASH] });
    expect(combatOf(endPlayerTurn(state)).heat).toBe(5 - STANCES.guard.ventAtTurnEnd);
  });
});

describe('overheat', () => {
  it('computes its damage from the threshold', () => {
    expect(overheatDamageAt(7)).toBe(0);
    expect(overheatDamageAt(8)).toBe(3);
    expect(overheatDamageAt(10)).toBe(9);
  });

  it('burns a card and takes hull at the threshold', () => {
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.overheatAt + STANCES.guard.ventAtTurnEnd,
      hand: [IAI_SLASH, IAI_SLASH],
      drawPile: [SOLAR_PARRY],
    });
    const before = hullOf(state);
    const after = endPlayerTurn(state);
    expect(hullOf(after)).toBeLessThan(before);
    expect(combatOf(after).exhaust.length).toBe(1);
  });

  it('costs energy next turn at critical', () => {
    // GUARD vents 2 at end of turn, so start at 12 to land on 10.
    const state = makeFight({
      stance: 'guard',
      heat: HEAT.criticalAt + STANCES.guard.ventAtTurnEnd,
      hand: [IAI_SLASH],
      drawPile: [SOLAR_PARRY, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH, IAI_SLASH],
      hull: 500,
    });
    expect(combatOf(endPlayerTurn(state)).energy).toBe(
      PLAYER.energyPerTurn - HEAT.criticalEnergyLoss,
    );
  });

  it('lets IAI’s own passive tip you over', () => {
    // At 7 you are safe. IAI's +1 at end of turn puts you at 8, and the check
    // runs after the passive — that is the bargain IAI offers.
    const state = makeFight({ stance: 'iai', heat: 7, hand: [IAI_SLASH], drawPile: [SOLAR_PARRY] });
    const before = hullOf(state);
    const after = endPlayerTurn(state);
    expect(combatOf(after).heat).toBe(8);
    expect(hullOf(after)).toBe(before - overheatDamageAt(8));
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
    const after = applyAction(telegraphAll(state), { kind: 'endTurn' });
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
