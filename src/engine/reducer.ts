/* `applyAction(state, action) => newState`. The only way state changes.
 *
 * Pure and total: every action produces a state, and an action that makes no
 * sense in the current phase is ignored rather than throwing. The UI can then
 * dispatch optimistically, and — more importantly — a replayed action log
 * never explodes halfway through because one entry arrived out of order.
 */

import type { Action, ActionLog } from './actions.ts';
import type { GameState } from './types.ts';
import {
  appendLog,
  createInitialState,
  createRunState,
  createTutorialRunState,
} from './state.ts';
import { normalizeSeed } from './rng.ts';
import { advanceEnemyTurn, endPlayerTurn, playCard, startCombat } from './combat/combat.ts';
import {
  advanceAct,
  claimRewardAlloy,
  concludeNode,
  enterNode,
  leaveEvent,
  leaveLanding,
  leaveNode,
  leaveReward,
  openMap,
  safePlanetHeal,
  safePlanetRemove,
  safePlanetTrade,
  safePlanetUpgrade,
  stationRepair,
  takeRewardCard,
  takeRewardRelic,
} from './run/run.ts';
import { chooseEventOption } from './run/events.ts';
import { buyForge, buyImplant, buyMastery, buyRemoval, buyShopCard } from './run/shop.ts';
import { MAX_DEPTH } from '../content/balance.ts';
import { CLEAR_SPACE_ID } from '../content/environments.ts';
import { TUTORIAL_ENCOUNTER_ID } from '../content/tutorial.ts';

export function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, Math.trunc(depth)));
}

/**
 * Settle a combat that has just resolved.
 *
 * A loss ends the run — the ronin's death is final. A win hands over to the run
 * loop for the reward.
 */
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

  /* The introduction ends when its one fight does. There is no chart behind it
     to hand a reward screen onto, and `concludeNode` would be reaching for a
     node that was never generated. */
  if (run !== null && run.tutorial) {
    return { ...won, phase: 'over', run: { ...run, outcome: 'won', combat: run.combat } };
  }

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

    case 'beginTutorial': {
      if (state.phase !== 'title') return state;
      const seed = normalizeSeed(state.title.seed);
      const opened: GameState = {
        ...state,
        phase: 'run',
        title: { seed, depth: 0 },
        run: createTutorialRunState(seed),
        log: [],
      };
      return startCombat(
        appendLog(opened, {
          source: 'system',
          kind: 'run',
          text: 'A derelict hauler, and nobody watching. Good enough to practise on.',
          detail: { tutorial: true },
        }),
        TUTORIAL_ENCOUNTER_ID,
        CLEAR_SPACE_ID,
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

    case 'advanceEnemies': {
      if (state.run?.combat?.outcome !== 'ongoing') return state;
      return settleCombat(advanceEnemyTurn(state));
    }

    case 'leaveLanding': {
      if (state.run?.screen !== 'landing') return state;
      // Settled, because the node may resolve straight into a fight the player
      // then loses on the enemy's first swing.
      return settleCombat(leaveLanding(state));
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
      return stationRepair(state);
    }

    case 'buyShopCard': {
      if (state.run?.screen !== 'station') return state;
      return buyShopCard(state, action.cardId);
    }

    case 'buyRemoval': {
      if (state.run?.screen !== 'station') return state;
      return buyRemoval(state, action.cardUid);
    }

    case 'buyForge': {
      if (state.run?.screen !== 'station') return state;
      return buyForge(state, action.cardUid);
    }

    case 'buyMastery': {
      if (state.run?.screen !== 'station') return state;
      return buyMastery(state, action.masteryId);
    }

    case 'buyImplant': {
      if (state.run?.screen !== 'station') return state;
      return buyImplant(state, action.implantId);
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
