/* `applyAction(state, action) => newState`. The only way state changes.
 *
 * Pure and total: every action produces a state, and an action that makes no
 * sense in the current phase is ignored rather than throwing. The UI can then
 * dispatch optimistically, and — more importantly — a replayed action log
 * never explodes halfway through because one entry arrived out of order.
 */

import type { Action, ActionLog } from './actions.ts';
import type { GameState } from './types.ts';
import { appendLog, createInitialState, createRunState, withRun } from './state.ts';
import { normalizeSeed } from './rng.ts';
import { advanceEnemyTurn, endPlayerTurn, playCard } from './combat/combat.ts';
import { scanEnemy } from './combat/intents.ts';
import { aimAt, intervene, resolveShipTurn } from './ship/combat.ts';
import {
  moveModule as moveOnGrid,
  place as placeOnGrid,
  rotateModule as rotateOnGrid,
  unplace as unplaceOnGrid,
} from './ship/grid.ts';
import { crashLand, repairDrive } from './ship/crash.ts';
import {
  advanceAct,
  claimRewardAlloy,
  concludeNode,
  enterNode,
  leaveEvent,
  leaveNode,
  leaveReward,
  openMap,
  safePlanetHeal,
  safePlanetRemove,
  safePlanetTrade,
  safePlanetUpgrade,
  stationRepair,
  takeRewardCard,
  takeRewardModule,
  takeRewardRelic,
} from './run/run.ts';
import { chooseEventOption } from './run/events.ts';
import {
  buyGrid,
  buyMastery,
  buyRemoval,
  buyShopCard,
  buyShopModule,
  repairShip,
} from './run/shop.ts';
import { MAX_DEPTH } from '../content/balance.ts';

export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)));
}

/**
 * Settle a combat that has just resolved.
 *
 * A loss ends the run — on foot, the ronin's death is final. A win hands over
 * to the run loop for the reward. Losing a *space* battle will crash rather
 * than kill (see SHIP.md), which is why this branch is about the arena and not
 * about combat in general.
 */
/** Close out a ship fight. Losing crashes rather than kills — see SHIP.md. */
function settleShipCombat(state: GameState): GameState {
  const fight = state.run?.shipCombat ?? null;
  if (fight === null || fight.outcome === 'ongoing') return state;

  if (fight.outcome === 'won') {
    return appendLog(
      // `forcedTier` is cleared here as well as in `concludeNode`: only the
      // surface path pays a reward, so a tier that reached a ship fight has
      // nothing to spend it and would otherwise leak into the next fight.
      withRun(state, (run) => ({ ...run, shipCombat: null, screen: 'map', forcedTier: null })),
      { source: 'system', kind: 'combat', text: 'The other ship stops moving.', detail: null },
    );
  }

  // You cannot die in space. Losing crashes you back onto the map.
  return crashLand(state);
}

function settleCombat(state: GameState): GameState {
  const combat = state.run?.combat ?? null;
  if (combat === null || combat.outcome === 'ongoing') return state;

  if (combat.outcome === 'lost') {
    const ended = appendLog(state, {
      source: 'system',
      kind: 'combat',
      text: 'The run ends here.',
      detail: { outcome: 'lost' },
    });
    return {
      ...ended,
      phase: 'over',
      run: ended.run === null ? null : { ...ended.run, outcome: 'died' },
    };
  }

  const won = appendLog(state, {
    source: 'system',
    kind: 'combat',
    text: 'Contact cleared.',
    detail: { outcome: 'won' },
  });

  // A boss ends the act. Acts 1 and 2 hand over to the next sky; Act 3's boss
  // is the run. The reward is paid out first either way — the act finale is
  // where the Mastery comes from, and skipping it would make the boss the one
  // fight that gives nothing.
  const run = won.run;
  const atBoss = run !== null && run.map !== null && run.position === run.map.bossId;
  if (atBoss && run !== null && run.act >= 3) {
    return {
      ...won,
      phase: 'over',
      run: { ...run, outcome: 'won', combat: null },
    };
  }

  return concludeNode(won);
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.kind) {
    case 'setSeed': {
      if (state.phase !== 'title') return state;
      return { ...state, title: { ...state.title, seed: normalizeSeed(action.seed) } };
    }

    case 'setDepth': {
      if (state.phase !== 'title') return state;
      return { ...state, title: { ...state.title, depth: clampDepth(action.depth) } };
    }

    case 'beginRun': {
      if (state.phase !== 'title') return state;
      const seed = normalizeSeed(state.title.seed);
      const depth = clampDepth(state.title.depth);
      const started: GameState = {
        ...state,
        phase: 'run',
        title: { seed, depth },
        run: createRunState(seed, depth),
        log: [],
      };
      return openMap(
        appendLog(started, {
          source: 'system',
          kind: 'run',
          text: `Run started. Seed ${seed}, Depth ${depth}.`,
          detail: { seed, depth },
        }),
      );
    }

    case 'moveToNode': {
      if (state.run === null || state.run.screen !== 'map' || state.run.combat !== null) return state;
      return settleCombat(enterNode(state, action.nodeId));
    }

    case 'playCard': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return settleCombat(playCard(state, action.cardUid, action.targetUid));
    }

    case 'endTurn': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return settleCombat(endPlayerTurn(state));
    }

    case 'scanEnemy': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return scanEnemy(state, action.enemyUid);
    }

    case 'advanceEnemies': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return settleCombat(advanceEnemyTurn(state));
    }

    case 'intervene': {
      if (state.run?.shipCombat?.outcome !== 'ongoing') return state;
      return intervene(state, action.verb);
    }

    case 'aimAt': {
      if (state.run?.shipCombat?.outcome !== 'ongoing') return state;
      return aimAt(state, action.target);
    }

    case 'resolveShipTurn': {
      if (state.run?.shipCombat?.outcome !== 'ongoing') return state;
      return settleShipCombat(resolveShipTurn(state));
    }

    case 'moveModule': {
      const run = state.run;
      if (run === null) return state;
      // In a fight, moving costs the turn's lever; between fights it is free.
      if (run.shipCombat !== null && run.shipCombat.usedIntervention !== null) return state;
      const ship = moveOnGrid(run.ship, action.moduleId, action.x, action.y, action.rot);
      if (ship === run.ship) return state;
      const moved = withRun(state, (current) => ({ ...current, ship }));
      if (run.shipCombat === null) return moved;
      return withRun(moved, (current) => ({
        ...current,
        shipCombat:
          current.shipCombat === null ? null : { ...current.shipCombat, usedIntervention: 'reposition' },
      }));
    }

    /*
     * The grid helpers return the ship unchanged when the move is refused, so
     * the reducer has to hand back the *same state object* rather than a fresh
     * wrapper around identical data. The store skips notifying on reference
     * equality, and a "nothing happened" that still re-renders is how a
     * rejected placement ends up flashing the whole screen.
     */
    case 'placeModule': {
      if (state.run === null) return state;
      const ship = placeOnGrid(state.run.ship, action.moduleId, action.x, action.y, action.rot ?? 0);
      if (ship === state.run.ship) return state;
      return withRun(state, (current) => ({ ...current, ship }));
    }

    case 'rotateModule': {
      if (state.run === null) return state;
      const ship = rotateOnGrid(state.run.ship, action.moduleId);
      if (ship === state.run.ship) return state;
      return withRun(state, (current) => ({ ...current, ship }));
    }

    case 'unplaceModule': {
      if (state.run === null) return state;
      const ship = unplaceOnGrid(state.run.ship, action.moduleId);
      if (ship === state.run.ship) return state;
      return withRun(state, (current) => ({ ...current, ship }));
    }

    case 'openLoadout': {
      // Only between fights: mid-combat the grid is edited through Reposition,
      // which costs the turn's lever.
      if (state.run === null || state.run.combat !== null || state.run.shipCombat !== null) return state;
      return withRun(state, (current) => ({ ...current, screen: 'ship' }));
    }

    case 'repairDrive': {
      if (state.run === null) return state;
      return repairDrive(state);
    }

    case 'takeRewardModule': {
      if (state.run?.screen !== 'reward') return state;
      return takeRewardModule(state, action.moduleId);
    }

    case 'takeRewardCard': {
      if (state.run?.screen !== 'reward') return state;
      return takeRewardCard(state, action.cardId);
    }

    case 'takeRewardRelic': {
      if (state.run?.screen !== 'reward') return state;
      return takeRewardRelic(state, action.relicId);
    }

    case 'claimRewardAlloy': {
      if (state.run?.screen !== 'reward') return state;
      return claimRewardAlloy(state);
    }

    case 'leaveReward': {
      if (state.run?.screen !== 'reward') return state;
      const settled = leaveReward(state);
      // The act finale pays out first and moves you on second, so the Mastery
      // and the module land before the sky changes.
      const run = settled.run;
      const atBoss = run !== null && run.map !== null && run.position === run.map.bossId;
      return atBoss && run !== null && run.act < 3 ? advanceAct(settled) : settled;
    }

    case 'safePlanetHeal': {
      if (state.run?.screen !== 'safe') return state;
      return safePlanetHeal(state);
    }

    case 'safePlanetUpgrade': {
      if (state.run?.screen !== 'safe') return state;
      return safePlanetUpgrade(state, action.cardUid);
    }

    case 'safePlanetRemove': {
      if (state.run?.screen !== 'safe') return state;
      return safePlanetRemove(state, action.cardUid);
    }

    case 'safePlanetTrade': {
      if (state.run?.screen !== 'safe') return state;
      return safePlanetTrade(state);
    }

    case 'chooseEventOption': {
      if (state.run?.screen !== 'event') return state;
      return chooseEventOption(state, action.optionId);
    }

    case 'leaveEvent': {
      if (state.run?.screen !== 'event') return state;
      // Settled, in case the choice opened onto a fight the player then lost.
      return settleCombat(leaveEvent(state));
    }

    case 'stationRepair': {
      if (state.run?.screen !== 'station') return state;
      return stationRepair(state, action.amount);
    }

    case 'repairShip': {
      if (state.run?.screen !== 'station') return state;
      return repairShip(state, action.amount);
    }

    case 'buyShopCard': {
      if (state.run?.screen !== 'station') return state;
      return buyShopCard(state, action.cardId);
    }

    case 'buyShopModule': {
      if (state.run?.screen !== 'station') return state;
      return buyShopModule(state, action.moduleId);
    }

    case 'buyRemoval': {
      if (state.run?.screen !== 'station') return state;
      return buyRemoval(state, action.cardUid);
    }

    case 'buyGrid': {
      if (state.run?.screen !== 'station') return state;
      return buyGrid(state);
    }

    case 'buyMastery': {
      if (state.run?.screen !== 'station') return state;
      return buyMastery(state, action.masteryId);
    }

    case 'leaveNode': {
      if (state.run === null || state.run.screen === 'combat') return state;
      return leaveNode(state);
    }

    case 'abandonRun': {
      if (state.run === null || state.run.outcome !== null) return state;
      const abandoned: GameState = {
        ...state,
        phase: 'over',
        run: { ...state.run, outcome: 'abandoned' },
      };
      return appendLog(abandoned, {
        source: 'player',
        kind: 'run',
        text: 'Run abandoned.',
        detail: null,
      });
    }

    case 'returnToTitle': {
      // Deliberately a fresh state rather than a reset: nothing from the
      // finished run should be able to leak into the next one.
      const seed = state.run === null ? state.title.seed : state.run.seed;
      return createInitialState(seed, state.title.depth);
    }

    default: {
      // Exhaustiveness. If this stops compiling, an action has no case.
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Fold a list of actions. The shape replay and the simulator both use. */
export function applyActions(state: GameState, actions: readonly Action[]): GameState {
  return actions.reduce<GameState>(applyAction, state);
}

/**
 * Rebuild a run from its log. The regression harness, the simulator's repro
 * path, and the answer to any bug report that arrives with a seed.
 */
export function replay(log: ActionLog): GameState {
  const base = createInitialState(log.seed, log.depth);
  return applyActions(base, log.actions);
}
