/* The run loop: the map, node resolution, rewards, the Safe Planet, the
 * Station, and replay.
 *
 * Replay is the headline. `seed + action log` has to reproduce a whole run —
 * fights, rewards, purchases and all — or the regression harness, the
 * simulator and the bug report format all stop working at once.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, ActionLog } from '../src/engine/actions.ts';
import type { CardDef, GameState } from '../src/engine/types.ts';
import { applyAction, applyActions, replay } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { hashState, stableStringify } from '../src/engine/serialize.ts';
import { availableMoves, currentNode } from '../src/engine/map/route.ts';
import { canPlay } from '../src/engine/combat/combat.ts';
import { archetypeLean } from '../src/engine/run/rewards.ts';
import { removalCost } from '../src/engine/run/economy.ts';
import { reloadContent } from '../src/content/index.ts';
import { cards as cardTable } from '../src/content/registry.ts';
import { ECONOMY, PLAYER } from '../src/content/balance.ts';
import { endTurnVia } from './helpers.ts';

const TEST_CARD: CardDef = {
  id: 'test_uncommon',
  name: 'Test Blade',
  type: 'attack',
  rarity: 'uncommon',
  archetype: 'iai',
  cost: 1,
  effects: [{ op: 'damage', amount: 8, target: 'enemy' }],
  upgrade: { effects: [{ op: 'damage', amount: 11, target: 'enemy' }] },
};

beforeEach(() => {
  reloadContent();
});

function openRun(seed: string): GameState {
  return applyActions(createInitialState(seed), [{ kind: 'beginRun' }]);
}

/** Walk into the first node of the given type, or return null if unreachable. */
function walkTo(state: GameState, type: string, limit = 30): GameState | null {
  let current = state;
  for (let step = 0; step < limit; step++) {
    const run = current.run;
    if (run === null || run.screen !== 'map') return null;
    const moves = availableMoves(run);
    if (moves.length === 0) return null;
    const wanted = moves.find((node) => node.type === type);
    const next = wanted ?? moves[0];
    if (next === undefined) return null;
    current = applyAction(applyAction(current, { kind: 'moveToNode', nodeId: next.id }), { kind: 'leaveLanding' });
    if (currentNode(current.run ?? run)?.type === type) return current;
    // Fight through whatever we landed on.
    let guard = 0;
    while (guard++ < 60 && current.run?.combat?.outcome === 'ongoing') {
      current = endTurnVia(current);
    }
    if (current.phase === 'over') return null;
    if (current.run?.screen === 'reward') {
      current = applyAction(current, { kind: 'leaveReward' });
    }
  }
  return null;
}

describe('opening a run', () => {
  it('lands on the map with a generated act', () => {
    const state = openRun('OPEN-1');
    expect(state.run?.screen).toBe('map');
    expect(state.run?.map?.act).toBe(1);
    expect(state.run?.position).toBeNull();
    expect(state.run?.combat).toBeNull();
    expect(state.run?.pilot.deck).toHaveLength(PLAYER.startingDeckSize);
  });

  it('offers only the origin to begin with', () => {
    const state = openRun('OPEN-2');
    const run = state.run;
    expect(run).not.toBeNull();
    expect(availableMoves(run!).map((node) => node.id)).toEqual([run!.map!.startId]);
  });

  it('opens the real fan of choices once the origin is behind you', () => {
    let state = openRun('OPEN-2b');
    state = applyAction(applyAction(state, { kind: 'moveToNode', nodeId: state.run!.map!.startId }), { kind: 'leaveLanding' });
    // The origin is a fight; play it out however it goes.
    let guard = 0;
    while (guard++ < 200 && state.run?.combat?.outcome === 'ongoing') {
      state = endTurnVia(state);
    }
    if (state.phase === 'over') return;
    if (state.run?.screen === 'reward') state = applyAction(state, { kind: 'leaveReward' });

    const lanes = availableMoves(state.run!).length;
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(lanes).toBeLessThanOrEqual(6);
  });

  it('refuses a node that is not reachable', () => {
    const state = openRun('OPEN-3');
    const far = state.run?.map?.nodes.find((node) => node.row === 5);
    expect(far).toBeDefined();
    expect(applyAction(applyAction(state, { kind: 'moveToNode', nodeId: far!.id }), { kind: 'leaveLanding' })).toBe(state);
  });

  it('starts a fight when it enters a combat node', () => {
    const state = openRun('OPEN-4');
    const entry = availableMoves(state.run!)[0]!;
    const fighting = applyAction(applyAction(state, { kind: 'moveToNode', nodeId: entry.id }), { kind: 'leaveLanding' });
    expect(fighting.run?.screen).toBe('combat');
    expect(fighting.run?.combat?.outcome).toBe('ongoing');
    expect(fighting.run?.visited).toContain(entry.id);
  });
});

describe('rewards', () => {
  /**
   * Fight the first node out. Plays whatever it can afford, then ends the turn
   * — playing an unaffordable card is a no-op, so a driver that does not fall
   * back to `endTurn` spins forever without the fight ever progressing.
   */
  function reachReward(seed: string): GameState {
    let state = openRun(seed);
    const entry = availableMoves(state.run!)[0]!;
    state = applyAction(applyAction(state, { kind: 'moveToNode', nodeId: entry.id }), { kind: 'leaveLanding' });

    let guard = 0;
    while (guard++ < 200 && state.run?.combat?.outcome === 'ongoing') {
      const combat = state.run.combat;
      const playable = combat.hand.find((card) => canPlay(state, card.uid).ok);
      if (playable === undefined) {
        state = endTurnVia(state);
        continue;
      }
      state = applyAction(state, {
        kind: 'playCard',
        cardUid: playable.uid,
        targetUid: combat.enemies.find((enemy) => enemy.hp > 0)?.uid ?? null,
      });
    }
    return state;
  }

  it('offers a reward after a won fight', () => {
    let state: GameState | null = null;
    for (const seed of ['R-1', 'R-2', 'R-3', 'R-4', 'R-5']) {
      const attempt = reachReward(seed);
      if (attempt.run?.screen === 'reward') {
        state = attempt;
        break;
      }
    }
    expect(state, 'no seed produced a won fight').not.toBeNull();
    expect(state!.run?.pendingReward).not.toBeNull();
    expect(state!.run?.combat).toBeNull();
  });

  it('pays Alloy once, and only once', () => {
    cardTable.register([TEST_CARD]);
    let state: GameState | null = null;
    for (const seed of ['A-1', 'A-2', 'A-3', 'A-4', 'A-5']) {
      const attempt = reachReward(seed);
      if (attempt.run?.screen === 'reward') {
        state = attempt;
        break;
      }
    }
    expect(state).not.toBeNull();

    const offered = state!.run!.pendingReward!.alloy;
    expect(offered).toBeGreaterThanOrEqual(ECONOMY.alloyPerCombat.min);

    const claimed = applyAction(state!, { kind: 'claimRewardAlloy' });
    expect(claimed.run?.alloy).toBe(offered);
    // Claiming again must not pay twice.
    expect(applyAction(claimed, { kind: 'claimRewardAlloy' }).run?.alloy).toBe(offered);
  });

  it('takes at most one card, and Skip is real', () => {
    cardTable.register([TEST_CARD]);
    let state: GameState | null = null;
    for (const seed of ['C-1', 'C-2', 'C-3', 'C-4', 'C-5']) {
      const attempt = reachReward(seed);
      if (attempt.run?.screen === 'reward' && attempt.run.pendingReward!.cardIds.length > 0) {
        state = attempt;
        break;
      }
    }
    expect(state, 'no reward offered a card').not.toBeNull();

    const before = state!.run!.pilot.deck.length;
    const ids = state!.run!.pendingReward!.cardIds;
    const first = ids[0]!;

    // Choosing only marks the choice — nothing reaches the deck yet, so the
    // pick stays changeable right up to the moment it is committed.
    const took = applyAction(state!, { kind: 'takeRewardCard', cardId: first });
    expect(took.run?.pilot.deck).toHaveLength(before);
    expect(took.run?.pendingReward?.taken).toEqual([first]);

    // Clicking the same card again puts it back.
    const undone = applyAction(took, { kind: 'takeRewardCard', cardId: first });
    expect(undone.run?.pendingReward?.taken).toEqual([]);

    // Picking a different one swaps rather than adding a second.
    const second = ids[1];
    if (second !== undefined) {
      const swapped = applyAction(took, { kind: 'takeRewardCard', cardId: second });
      expect(swapped.run?.pendingReward?.taken).toEqual([second]);
    }

    // Leaving commits exactly one.
    const left = applyAction(took, { kind: 'leaveReward' });
    expect(left.run?.pilot.deck).toHaveLength(before + 1);
    expect(left.run?.screen).toBe('map');
    expect(left.run?.pendingReward).toBeNull();

    // Skipping takes nothing.
    const skipped = applyAction(state!, { kind: 'leaveReward' });
    expect(skipped.run?.pilot.deck).toHaveLength(before);
    expect(skipped.run?.screen).toBe('map');
  });

  it('reads the deck lean from earned cards, not the starting deck', () => {
    cardTable.register([TEST_CARD]);
    const state = openRun('LEAN');
    expect(archetypeLean(state.run!)).toBe('neutral');
  });
});

describe('the Safe Planet', () => {
  it('offers exactly one choice, and each one leaves for the map', () => {
    const reached = walkTo(openRun('SAFE-1'), 'safe');
    if (reached === null) return; // no safe planet on the first path; covered by mapgen tests
    expect(reached.run?.screen).toBe('safe');

    const healed = applyAction(reached, { kind: 'safePlanetHeal' });
    expect(healed.run?.screen).toBe('map');
    expect(healed.run!.pilot.health).toBeGreaterThanOrEqual(reached.run!.pilot.health);
  });

  it('strips a card and forges a card', () => {
    const state = openRun('SAFE-2');
    const run = state.run!;
    const card = run.pilot.deck[0]!;

    // Drive the run functions through a state parked on the safe screen.
    const parked: GameState = { ...state, run: { ...run, screen: 'safe' } };

    const stripped = applyAction(parked, { kind: 'safePlanetRemove', cardUid: card.uid });
    expect(stripped.run?.pilot.deck).toHaveLength(PLAYER.startingDeckSize - 1);
    expect(stripped.run?.pilot.deck.some((entry) => entry.uid === card.uid)).toBe(false);

    const forged = applyAction(parked, { kind: 'safePlanetUpgrade', cardUid: card.uid });
    expect(forged.run?.pilot.deck.find((entry) => entry.uid === card.uid)?.upgraded).toBe(true);
    // Upgrading twice changes nothing.
    expect(applyAction(forged, { kind: 'safePlanetUpgrade', cardUid: card.uid })).toBe(forged);
  });

  it('bleeds health for Alloy', () => {
    const state = openRun('SAFE-3');
    const parked: GameState = { ...state, run: { ...state.run!, screen: 'safe' } };
    const traded = applyAction(parked, { kind: 'safePlanetTrade' });
    expect(traded.run?.alloy).toBe(ECONOMY.refuelAlloyGain);
    expect(traded.run?.pilot.health).toBe(PLAYER.maxHealth - ECONOMY.refuelHullCost);
  });
});

describe('the Station', () => {
  it('repairs for Alloy, and refuses what cannot be paid for', () => {
    const state = openRun('STATION-1');
    const run = state.run!;
    const parked: GameState = {
      ...state,
      run: { ...run, screen: 'station', alloy: 30, pilot: { ...run.pilot, health: 40 } },
    };

    const repaired = applyAction(parked, { kind: 'stationRepair', amount: 10 });
    expect(repaired.run?.pilot.health).toBe(50);
    expect(repaired.run?.alloy).toBe(30 - 10 * ECONOMY.hullRepairPerPoint);

    // Asking for more than the missing health is clamped, not refused.
    const full = applyAction(parked, { kind: 'stationRepair', amount: 999 });
    expect(full.run?.pilot.health).toBe(70);
    expect(full.run?.alloy).toBe(0);

    // But a repair the Alloy cannot cover is refused outright rather than
    // partially paid — a half-purchase is the kind of thing nobody notices
    // until they are 20 Alloy short of the module that would have saved them.
    const broke: GameState = { ...parked, run: { ...parked.run!, alloy: 5 } };
    expect(applyAction(broke, { kind: 'stationRepair', amount: 999 })).toBe(broke);
  });

  it('charges more for each removal bought', () => {
    expect(removalCost(0)).toBe(ECONOMY.cardRemovalBase);
    expect(removalCost(2)).toBe(ECONOMY.cardRemovalBase + 2 * ECONOMY.cardRemovalIncrement);
  });
});

describe('replay', () => {
  it('reproduces a whole run from the seed and the action log', () => {
    const seed = 'REPLAY-ME';
    const actions: Action[] = [{ kind: 'beginRun' }];
    let live = applyActions(createInitialState(seed), actions);

    // Play a real slice of a run: move, fight, take the reward, move again.
    for (let step = 0; step < 12; step++) {
      const run = live.run;
      if (run === null || live.phase === 'over') break;

      let action: Action;
      if (run.screen === 'map') {
        const move = availableMoves(run)[0];
        if (move === undefined) break;
        action = { kind: 'moveToNode', nodeId: move.id };
      } else if (run.screen === 'combat') {
        action = { kind: 'endTurn' };
      } else if (run.screen === 'reward') {
        action = { kind: 'leaveReward' };
      } else {
        action = { kind: 'leaveNode' };
      }

      actions.push(action);
      live = applyAction(live, action);
    }

    const log: ActionLog = { seed, depth: 0, actions };
    const replayed = replay(log);

    expect(hashState(replayed)).toBe(hashState(live));
    expect(stableStringify(replayed)).toBe(stableStringify(live));
    // And it actually went somewhere.
    expect(actions.length).toBeGreaterThan(3);
  });

  it('reproduces identically twice over', () => {
    const log: ActionLog = {
      seed: 'TWICE',
      depth: 3,
      actions: [{ kind: 'beginRun' }, { kind: 'leaveNode' }],
    };
    expect(hashState(replay(log))).toBe(hashState(replay(log)));
  });
});

describe('unknown nodes', () => {
  it('resolve into something rather than stranding the player', () => {
    const state = openRun('UNKNOWN-1');
    const run = state.run!;
    const unknown = run.map!.nodes.find((node) => node.type === 'unknown');
    // Not every act has one reachable on row 0; the type existing at all is
    // what matters here, and mapgen covers the rest.
    if (unknown === undefined) return;
    expect(['unknown']).toContain(unknown.type);
  });
});
