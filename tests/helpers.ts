/* Shared scaffolding for the combat tests.
 *
 * Building a fight by hand rather than through `beginRun` keeps the tests
 * honest: a test that asserts something about Vulnerable should not also
 * depend on which encounter a seed happens to roll.
 */

import type {
  CardInstance,
  CombatState,
  EnemyDef,
  EnemyState,
  GameState,
  StanceId,
  StatusStack,
} from '../src/engine/types.ts';
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { applyActions } from '../src/engine/reducer.ts';
import { availableMoves } from '../src/engine/map/route.ts';
import { buildDeck, mintEnemy } from '../src/engine/combat/instances.ts';
import { HEAT, PLAYER } from '../src/content/balance.ts';
import { CLEAR_SPACE_ID } from '../src/content/environments.ts';
import { reloadContent } from '../src/content/index.ts';
import { enemies as enemyTable } from '../src/content/registry.ts';

export interface FightOptions {
  readonly enemyIds?: readonly string[];
  readonly hand?: readonly string[];
  readonly drawPile?: readonly string[];
  readonly stance?: StanceId;
  readonly heat?: number;
  readonly energy?: number;
  readonly block?: number;
  readonly focus?: number;
  readonly hull?: number;
  readonly playerStatuses?: readonly StatusStack[];
  readonly enemyStatuses?: readonly StatusStack[];
  readonly enemyHp?: number;
}

/**
 * A combat in a known configuration. Nothing is telegraphed and no hooks have
 * fired — call the real entry points for that.
 */
export function makeFight(options: FightOptions = {}): GameState {
  reloadContent();

  const base = createInitialState('TEST');
  const run = createRunState('TEST', 0);

  const handIds = options.hand ?? [];
  const drawIds = options.drawPile ?? [];
  const builtHand = buildDeck(run.uidCounter, handIds);
  const builtDraw = buildDeck(builtHand.uidCounter, drawIds);

  let counter = builtDraw.uidCounter;
  const enemies: EnemyState[] = (options.enemyIds ?? ['scrap_hound']).map((id) => {
    const def: EnemyDef = enemyTable.get(id);
    const minted = mintEnemy(counter, def);
    counter = minted.uidCounter;
    return {
      ...minted.value,
      hp: options.enemyHp ?? minted.value.hp,
      statuses: options.enemyStatuses ?? [],
    };
  });

  const combat: CombatState = {
    encounterId: 'test',
    environmentId: CLEAR_SPACE_ID,
    turn: 1,
    round: 1,
    stance: options.stance ?? 'guard',
    heat: options.heat ?? HEAT.min,
    energy: options.energy ?? PLAYER.energyPerTurn,
    block: options.block ?? 0,
    focus: options.focus ?? 0,
    statuses: options.playerStatuses ?? [],
    draw: builtDraw.deck,
    hand: builtHand.deck,
    discard: [],
    exhaust: [],
    enemies,
    cardsPlayedThisTurn: 0,
    blockGainedThisTurn: 0,
    attacksThisTurn: 0,
    energyPenaltyNextTurn: 0,
    outcome: 'ongoing',
  };

  return {
    ...base,
    phase: 'run',
    run: {
      ...run,
      uidCounter: counter,
      pilot: { ...run.pilot, health: options.hull ?? run.pilot.maxHealth },
      combat,
    },
  };
}

/**
 * Begin a run and walk into the first fight. `beginRun` opens the map, not a
 * combat — every entry node is a normal combat by invariant, so this is the
 * shortest honest path to a live fight through the real actions.
 */
export function beginRunInCombat(seed: string): GameState {
  reloadContent();
  const opened = applyActions(createInitialState(seed), [{ kind: 'beginRun' }]);
  const run = opened.run;
  if (run === null) throw new Error('test: beginRun produced no run');
  const entry = availableMoves(run)[0];
  if (entry === undefined) throw new Error('test: the map opened with nowhere to go');
  return applyActions(opened, [{ kind: 'moveToNode', nodeId: entry.id }]);
}

export function combatOf(state: GameState): CombatState {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) throw new Error('test: no combat');
  return combat;
}

export function hullOf(state: GameState): number {
  return state.run?.pilot.health ?? 0;
}

export function firstEnemy(state: GameState): EnemyState {
  const enemy = combatOf(state).enemies[0];
  if (enemy === undefined) throw new Error('test: no enemies');
  return enemy;
}

export function handCard(state: GameState, index: number): CardInstance {
  const card = combatOf(state).hand[index];
  if (card === undefined) throw new Error(`test: no card at hand index ${index}`);
  return card;
}
