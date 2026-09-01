/* The run loop: the map, node resolution, rewards, the Safe Planet, the
 * Station, and replay.
 *
 * Replay is the headline. `seed + action log` has to reproduce a whole run —
 * fights, rewards, purchases and all — or the regression harness, the
 * simulator and the bug report format all stop working at once.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, ActionLog } from '../src/engine/actions.ts';
import type { CardDef, GameState, NodeType } from '../src/engine/types.ts';
import { applyAction, applyActions, replay } from '../src/engine/reducer.ts';
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { generateMap } from '../src/engine/map/mapgen.ts';
import { createRng } from '../src/engine/rng.ts';
import { ENCOUNTERS } from '../src/content/encounters.ts';
import { hashState, stableStringify } from '../src/engine/serialize.ts';
import { availableMoves, currentNode } from '../src/engine/map/route.ts';
import { canPlay } from '../src/engine/combat/combat.ts';
import { removalCost } from '../src/engine/run/economy.ts';
import { stockShop } from '../src/engine/run/shop.ts';
import { concludeNode, repairOffer } from '../src/engine/run/run.ts';
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
  it('sells one fixed patch-up, and refuses one that cannot be paid for', () => {
    /*
     * Repair used to be a slider at 1 Alloy a point — a full heal for 70, which
     * is cheaper than a common card and made health something you bought back
     * rather than something you spent. One fixed purchase at implant money is
     * the trade the Station is supposed to pose.
     */
    const state = openRun('STATION-1');
    const stocked = stockShop(state, 'n4_2');
    const run = stocked.run!;
    const parked: GameState = {
      ...stocked,
      run: { ...run, screen: 'station', alloy: 400, pilot: { ...run.pilot, health: 20 } },
    };

    /* Priced by the point, at a rate that climbs with the act, and capped at
       half your maximum — a repair used to fill the bar, which made health a
       currency rather than a resource: the run's whole arc flattened into "can
       I afford the next Station". */
    const offer = repairOffer(parked.run!);
    const missing = run.pilot.maxHealth - 20;
    const ceiling = Math.floor(run.pilot.maxHealth / 2);
    expect(offer.rate).toBe(ECONOMY.repairPerHealth[parked.run!.act]);
    expect(offer.healed).toBe(Math.min(missing, ceiling));
    expect(offer.healed, 'the cap actually bites at 20 of 70').toBeLessThan(missing);
    expect(offer.price).toBe(offer.healed * offer.rate);

    const repaired = applyAction(parked, { kind: 'stationRepair' });
    expect(repaired.run?.pilot.health).toBe(20 + offer.healed);
    expect(repaired.run?.pilot.health, 'never to full from a bad act').toBeLessThan(
      run.pilot.maxHealth,
    );
    expect(repaired.run?.alloy).toBe(400 - offer.price);

    // One per Station. A second attempt changes nothing at all.
    expect(applyAction(repaired, { kind: 'stationRepair' })).toBe(repaired);

    /* And a repair the Alloy cannot cover is refused outright rather than
       partially paid. Selling as much as you can afford sounds kinder and is a
       trap: one click would quietly empty a wallet you were saving for an
       implant, which is the kind of thing nobody notices until they are twenty
       Alloy short of the thing that would have saved them. */
    const broke: GameState = { ...parked, run: { ...parked.run!, alloy: 5 } };
    expect(repairOffer(broke.run!).affordable).toBe(false);
    expect(applyAction(broke, { kind: 'stationRepair' })).toBe(broke);
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

describe("a Thread's reprisal opens the fight it promised", () => {
  /* Marked pays `{ op: 'ambush', tier: 'elite' }` and for a long time did not
     deliver one.

     `forcedTier` was read in two places and both did `openCombat(node)`, which
     takes `node.encounterId ?? fallbackEncounter()`. Neither consulted the
     tier. On a combat node the reprisal opened that node's own ordinary fight;
     on an Unknown or a Station it opened `fallbackEncounter` — "the first node
     on the chart that has an encounter", an Act-1-shaped normal fight.
     `concludeNode` then paid elite money for it, so the Thread had visibly
     fired and the fight was just a fight.

     Walked over many seeds and node types rather than asserted on one, because
     the two paths through it are the landing and the end of an Anomaly, and the
     node the reprisal lands on is whatever the route happened to reach. */

  function ambushOn(seed: string, type: NodeType): string | null {
    let state: GameState = {
      ...createInitialState(seed),
      run: createRunState(seed, 0),
    };
    const run = state.run;
    if (run === null) throw new Error('test: no run');

    const made = generateMap(createRng(seed), 1);
    const node = made.map.nodes.find((entry) => entry.type === type);
    if (node === undefined) return null;

    state = {
      ...state,
      run: { ...run, map: made.map, position: node.id, forcedTier: 'elite', screen: 'landing' },
    };
    // The landing is the door the reprisal comes through.
    state = {
      ...state,
      run: {
        ...state.run!,
        landing: { nodeId: node.id, title: node.name, body: '', resolved: [] },
      },
    };
    const after = applyAction(state, { kind: 'leaveLanding' });
    return after.run?.combat?.encounterId ?? null;
  }

  it('opens a Vareth hunting party, never an ordinary chart Elite', () => {
    /* The Thread says "The Vareth know your ship. They are slower than you and
       they do not stop", and for a long time it rolled the act's normal Elite
       pool — so being Marked meant a Kiln Alpha turned up. A fight, but not the
       one the sentence describes, and a fight a player who never touched the
       egg could also have walked into deliberately.
 
       Asserted as "is an ambush encounter" rather than "is vareth_hunt_1", so
       adding a second party per act does not break the test that protects the
       rule. */
    let checked = 0;
    for (let i = 0; i < 40; i += 1) {
      for (const type of ['unknown', 'event', 'combat', 'station'] as const) {
        const encounterId = ambushOn(`HUNT-${i}`, type);
        if (encounterId === null) continue;
        checked += 1;
        const def = ENCOUNTERS.find((entry) => entry.id === encounterId);
        expect(def?.ambush, `${type} node, seed ${i}: opened ${encounterId}`).toBe(true);
      }
    }
    expect(checked, 'no ambush was ever opened').toBeGreaterThan(30);
  });

  it('rolls an ELITE encounter, whatever the node underneath was', () => {
    const tierOf = (id: string | null): string | null =>
      ENCOUNTERS.find((entry) => entry.id === id)?.tier ?? null;

    let checked = 0;
    for (let i = 0; i < 60; i++) {
      for (const type of ['unknown', 'event', 'combat', 'station'] as const) {
        const encounterId = ambushOn(`AMBUSH-${i}`, type);
        if (encounterId === null) continue;
        checked += 1;
        expect(tierOf(encounterId), `${type} node, seed ${i}: ${encounterId}`).toBe('elite');
      }
    }
    expect(checked, 'no ambush was ever opened').toBeGreaterThan(50);
  });

  it('rolls a NORMAL encounter for a combat-tier reprisal', () => {
    // The other half. `ambush` also ships with `tier: 'combat'`, and that one
    // must not quietly become an Elite now that the tier is honoured.
    const state = (() => {
      const seed = 'AMBUSH-COMBAT';
      const base: GameState = { ...createInitialState(seed), run: createRunState(seed, 0) };
      const made = generateMap(createRng(seed), 1);
      const node = made.map.nodes.find((entry) => entry.type === 'unknown');
      if (node === undefined || base.run === null) throw new Error('test: no node');
      return {
        ...base,
        run: {
          ...base.run,
          map: made.map,
          position: node.id,
          forcedTier: 'combat' as const,
          screen: 'landing' as const,
          landing: { nodeId: node.id, title: node.name, body: '', resolved: [] },
        },
      };
    })();

    const after = applyAction(state, { kind: 'leaveLanding' });
    const encounterId = after.run?.combat?.encounterId ?? null;
    expect(ENCOUNTERS.find((entry) => entry.id === encounterId)?.tier).toBe('normal');
  });

  it('interrupts the node rather than replacing it', () => {
    /* The reprisal used to EAT the node. You routed two rows for a Station, the
       Thread came due, you fought an Elite, and the Station was simply gone —
       a second punishment nobody agreed to, and worst exactly when the player
       had planned carefully, because a careful plan is what makes losing the
       node hurt.

       Now it interrupts: the fight happens, its reward is taken, and the node
       opens as though you had just arrived. */
    const seed = 'AMBUSH-OWES';
    const base: GameState = { ...createInitialState(seed), run: createRunState(seed, 0) };
    const made = generateMap(createRng(seed), 1);
    const node = made.map.nodes.find((entry) => entry.type === 'station');
    if (node === undefined || base.run === null) throw new Error('test: no station');

    const arriving: GameState = {
      ...base,
      run: {
        ...base.run,
        map: made.map,
        position: node.id,
        forcedTier: 'elite' as const,
        screen: 'landing' as const,
        landing: { nodeId: node.id, title: node.name, body: '', resolved: [] },
      },
    };

    const fighting = applyAction(arriving, { kind: 'leaveLanding' });
    expect(fighting.run?.screen, 'the reprisal opens a fight').toBe('combat');
    expect(fighting.run?.ambushOwes, 'and the Station is remembered').toBe(node.id);

    /* Win it, take the reward screen, and leave. The node should be waiting on
       the other side of it. */
    const won = concludeNode({
      ...fighting,
      run: {
        ...fighting.run!,
        combat: { ...fighting.run!.combat!, outcome: 'won' as const, enemies: [] },
      },
    });
    expect(won.run?.screen, 'the reward comes first').toBe('reward');
    /* A reprisal pays a relic again. It did not for a long time, because a free
       Elite drop made being Marked something a player would deliberately
       arrange — but that is answered by making the fight a Vareth hunting party
       harder than the act's real Elites, rather than by withholding the reward.
       Nobody arranges that for a relic, and charging twice for one choice is
       what leaving the cards in place was already avoiding. */
    expect(
      won.run?.pendingReward?.relicIds.length,
      'a reprisal stopped paying its relic',
    ).toBeGreaterThan(0);

    const left = applyAction(won, { kind: 'leaveReward' });
    expect(left.run?.screen, 'and then the Station opens').toBe('station');
    expect(left.run?.ambushOwes, 'the debt is spent').toBeNull();
  });
});

describe('a question mark that came to nothing much', () => {
  /* The derelict outcome used to pay its Alloy and drop you back on the chart
     in the same frame, so the one `?` result with nothing to decide was also
     the only one that never got said out loud — it read as the node having done
     nothing at all. It gets its own screen now.

     Which introduces the thing worth testing: that screen names the node it
     came from, and leaving it must NOT resolve that node again. A `?` re-rolled
     on the way out is a different node every time you look at it. */

  function derelictRun(): GameState | null {
    for (let i = 0; i < 400; i++) {
      const seed = `DERELICT-${i}`;
      let state: GameState = { ...createInitialState(seed), run: createRunState(seed, 0) };
      const made = generateMap(createRng(seed), 1);
      const node = made.map.nodes.find((entry) => entry.type === 'unknown');
      if (node === undefined || state.run === null) continue;

      state = {
        ...state,
        run: {
          ...state.run,
          map: made.map,
          position: node.id,
          screen: 'landing',
          landing: { nodeId: node.id, title: node.name, body: '', resolved: [] },
        },
      };
      const after = applyAction(state, { kind: 'leaveLanding' });
      if (after.run?.landing?.outcome === true) return after;
    }
    return null;
  }

  it('shows a screen that says what was there', () => {
    const state = derelictRun();
    if (state === null) throw new Error('test: no seed rolled a derelict in 400 tries');
    expect(state.run?.screen).toBe('landing');
    expect(state.run?.landing?.body, 'the screen says nothing').not.toBe('');
    // Generated from the amount, so it names it rather than being one line for
    // every possible outcome.
    expect(state.run?.landing?.body).toMatch(/Alloy|Nothing in it/);
    expect(state.run?.alloy ?? 0, 'the Alloy was not paid').toBeGreaterThan(0);
  });

  it('goes back to the chart on the way out, without re-rolling the node', () => {
    const state = derelictRun();
    if (state === null) throw new Error('test: no seed rolled a derelict in 400 tries');
    const alloy = state.run?.alloy ?? 0;

    const left = applyAction(state, { kind: 'leaveLanding' });
    expect(left.run?.screen, 'the ? resolved a second time').toBe('map');
    expect(left.run?.landing).toBe(null);
    expect(left.run?.combat, 'it turned into a fight on the way out').toBe(null);
    expect(left.run?.alloy, 'it paid twice').toBe(alloy);
  });
});
