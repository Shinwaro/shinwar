/* The run loop — everything between fights.
 *
 * Entering a node, resolving what it turns out to be, paying out rewards, and
 * the Safe Planet menu. The reducer calls in here; nothing in here reaches
 * back out to the reducer.
 */

import type { CardId, GameState, MapNode, RunState } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { nextIntInclusive, pick, weightedPick } from '../rng.ts';
import { generateMap } from '../map/mapgen.ts';
import { canMoveTo, nodeById } from '../map/route.ts';
import { startCombat } from '../combat/combat.ts';
import { startShipCombat } from '../ship/combat.ts';
import { mintCard } from '../combat/instances.ts';
import { gainAlloy, removalCost, rollAlloy, spendAlloy } from './economy.ts';
import { offerMatchesLean, rollReward } from './rewards.ts';
import { ECONOMY, PLAYER, TREASURE_ALLOY, UNKNOWN_WEIGHTS } from '../../content/balance.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import { cards as cardTable, shipEnemies } from '../../content/registry.ts';

/* ---------- opening the run ---------- */

export function openMap(state: GameState): GameState {
  const run = requireRun(state);
  const generated = generateMap(run.rng, run.act);
  return withRun(state, (current) => ({
    ...current,
    rng: generated.rng,
    map: generated.map,
    position: null,
    visited: [],
    screen: 'map',
  }));
}

/* ---------- entering a node ---------- */

export function enterNode(state: GameState, nodeId: string): GameState {
  const run = requireRun(state);
  if (!canMoveTo(run, nodeId)) return state;

  const map = run.map;
  const node = map === null ? undefined : nodeById(map, nodeId);
  if (node === undefined) return state;

  let next = withRun(state, (current) => ({
    ...current,
    position: nodeId,
    visited: [...current.visited, nodeId],
  }));

  next = appendLog(next, {
    source: 'system',
    kind: 'run',
    text: `Entered ${node.type} at row ${node.row + 1}.`,
    detail: { node: nodeId, type: node.type },
  });

  next = fireHook(next, 'onNodeEntered', { nodeId, nodeType: node.type });

  return resolveNode(next, node);
}

function resolveNode(state: GameState, node: MapNode): GameState {
  switch (node.type) {
    case 'combat':
    case 'elite':
    case 'boss':
      return openCombat(state, node);

    case 'safe':
      return withRun(state, (run) => ({ ...run, screen: 'safe' }));

    case 'station':
      return withRun(state, (run) => ({ ...run, screen: 'station' }));

    case 'unknown':
      return resolveUnknown(state, node);

    // Anomalies and the crash pocket arrive at M4 and with ship combat. A node
    // type that resolves to nothing does not generate — see `NODE_WEIGHTS`.
    case 'event':
    case 'crash':
    case 'wreck':
      return withRun(state, (run) => ({ ...run, screen: 'map' }));

    default: {
      const unreachable: never = node.type;
      return unreachable;
    }
  }
}

/**
 * A `?`. Weighted on the `events` stream, and the weights shift as the pools
 * fill out — mostly an ambush or a derelict until events exist.
 */
function resolveUnknown(state: GameState, node: MapNode): GameState {
  const run = requireRun(state);
  const rolled = weightedPick(run.rng, 'events', [
    { value: 'combat' as const, weight: UNKNOWN_WEIGHTS.combat },
    { value: 'treasure' as const, weight: UNKNOWN_WEIGHTS.treasure },
    { value: 'event' as const, weight: UNKNOWN_WEIGHTS.event },
  ]);
  const spun = withRun(state, (current) => ({ ...current, rng: rolled.rng }));

  if (rolled.value === 'treasure') {
    const amount = nextIntInclusive(
      requireRun(spun).rng,
      'rewards',
      TREASURE_ALLOY.min,
      TREASURE_ALLOY.max,
    );
    const paid = gainAlloy(
      withRun(spun, (current) => ({ ...current, rng: amount.rng })),
      amount.value,
      'derelict',
    );
    return appendLog(withRun(paid, (current) => ({ ...current, screen: 'map' })), {
      source: 'derelict',
      kind: 'reward',
      text: 'A derelict, picked clean but for the alloy.',
      detail: null,
    });
  }

  // Ambush: the node had no encounter assigned, so pick one now.
  return openCombat(spun, { ...node, type: 'combat' });
}

function openCombat(state: GameState, node: MapNode): GameState {
  if (node.arena === 'space') return openShipCombat(state, node);

  const run = requireRun(state);
  const encounterId = node.encounterId ?? fallbackEncounter(run);
  if (encounterId === null) {
    // Nothing to fight. Better an empty node than a thrown error mid-run.
    return withRun(state, (current) => ({ ...current, screen: 'map' }));
  }
  const staged = withRun(state, (current) => ({ ...current, screen: 'combat' }));
  return startCombat(staged, encounterId, node.environmentId ?? CLEAR_SPACE_ID);
}

/** Pick an enemy ship on the map stream and hand over to the grid. */
function openShipCombat(state: GameState, node: MapNode): GameState {
  const run = requireRun(state);
  const pool = shipEnemies.all().filter((entry) => entry.act === run.act);
  if (pool.length === 0) return withRun(state, (current) => ({ ...current, screen: 'map' }));
  const rolled = pick(run.rng, 'map', pool);
  const spun = withRun(state, (current) => ({ ...current, rng: rolled.rng }));
  void node;
  return startShipCombat(spun, rolled.value.id);
}

function fallbackEncounter(run: RunState): string | null {
  const map = run.map;
  const any = map?.nodes.find((node) => node.encounterId !== null)?.encounterId;
  return any ?? null;
}

/* ---------- finishing a fight ---------- */

/**
 * Called once a combat has settled. A win pays out and offers a reward; the
 * boss ends the act. A loss is handled by the reducer, which ends the run.
 */
export function concludeNode(state: GameState): GameState {
  const run = requireRun(state);
  const combat = run.combat;
  if (combat === null || combat.outcome !== 'won') return state;

  const node = run.position === null || run.map === null ? undefined : nodeById(run.map, run.position);
  const tier = node?.type === 'boss' ? 'boss' : node?.type === 'elite' ? 'elite' : 'combat';

  const alloy = rollAlloy(run.rng, tier);
  let next = withRun(state, (current) => ({ ...current, rng: alloy.rng, combat: null }));

  const rolled = rollReward(requireRun(next).rng, requireRun(next), run.act, alloy.value, run.rewardDrought);
  next = withRun(next, (current) => ({
    ...current,
    rng: rolled.rng,
    // Alloy is paid on arrival. It is not a decision — nobody has ever left
    // money on a reward screen — so it should not cost a click.
    pendingReward: { ...rolled.offer, alloyClaimed: true },
    screen: 'reward',
  }));
  next = gainAlloy(next, rolled.offer.alloy, 'reward');

  // Drought tracking for the soft archetype nudge. Reset when a screen finally
  // offers something the deck wants; otherwise it climbs.
  const matched = offerMatchesLean(rolled.offer, requireRun(next));
  next = withRun(next, (current) => ({
    ...current,
    rewardDrought: matched ? 0 : current.rewardDrought + 1,
  }));

  return fireHook(next, 'onRewardOffered', { cardIds: rolled.offer.cardIds });
}

/* ---------- the reward screen ---------- */

/**
 * Choose a card — or change your mind, or unpick it entirely.
 *
 * This only marks the choice. Nothing reaches the deck until the screen is
 * left, so the pick stays changeable right up to the moment you commit. A
 * reward screen that locks on the first click punishes reading the third card.
 */
export function takeRewardCard(state: GameState, cardId: CardId): GameState {
  const run = requireRun(state);
  const offer = run.pendingReward;
  if (offer === null || !offer.cardIds.includes(cardId)) return state;

  const already = offer.taken.includes(cardId);
  return withRun(state, (current) => ({
    ...current,
    pendingReward:
      current.pendingReward === null
        ? null
        : { ...current.pendingReward, taken: already ? [] : [cardId] },
  }));
}

export function claimRewardAlloy(state: GameState): GameState {
  const run = requireRun(state);
  const offer = run.pendingReward;
  if (offer === null || offer.alloyClaimed) return state;

  const paid = gainAlloy(state, offer.alloy, 'reward');
  return withRun(paid, (current) => ({
    ...current,
    pendingReward: current.pendingReward === null
      ? null
      : { ...current.pendingReward, alloyClaimed: true },
  }));
}

/** Commit the choice. Skip is always available and always real. */
export function leaveReward(state: GameState): GameState {
  const run = requireRun(state);
  const offer = run.pendingReward;
  if (offer === null) return state;

  const chosen = offer.taken[0];
  const def = chosen === undefined ? undefined : cardTable.find(chosen);

  if (chosen === undefined || def === undefined) {
    return appendLog(
      withRun(state, (current) => ({ ...current, pendingReward: null, screen: 'map' })),
      { source: 'reward', kind: 'reward', text: 'Took nothing.', detail: null },
    );
  }

  const minted = mintCard(run.uidCounter, chosen, false);
  const next = withRun(state, (current) => ({
    ...current,
    uidCounter: minted.uidCounter,
    pilot: { ...current.pilot, deck: [...current.pilot.deck, minted.value] },
    pendingReward: null,
    screen: 'map',
  }));

  return appendLog(next, {
    source: 'reward',
    kind: 'reward',
    text: `Took ${def.name}.`,
    detail: { card: chosen },
  });
}

/* ---------- the Safe Planet ----------
   A menu, never a bare heal button. "Heal or upgrade" is one of the best
   decisions Slay the Spire makes and it costs nothing to implement. */

export type SafeChoice = 'heal' | 'upgrade' | 'remove' | 'trade';

export function safePlanetHeal(state: GameState): GameState {
  const run = requireRun(state);
  const amount = Math.floor(run.pilot.maxHealth * ECONOMY.safePlanetHealPct);
  const healed = Math.min(run.pilot.maxHealth, run.pilot.health + amount);
  const next = withRun(state, (current) => ({
    ...current,
    pilot: { ...current.pilot, health: healed },
    screen: 'map',
  }));
  return appendLog(next, {
    source: 'safe',
    kind: 'run',
    text: `Rested. Health ${healed}/${run.pilot.maxHealth}.`,
    detail: { healed },
  });
}

export function safePlanetUpgrade(state: GameState, cardUid: string): GameState {
  const run = requireRun(state);
  const card = run.pilot.deck.find((entry) => entry.uid === cardUid);
  if (card === undefined || card.upgraded) return state;

  const next = withRun(state, (current) => ({
    ...current,
    pilot: {
      ...current.pilot,
      deck: current.pilot.deck.map((entry) =>
        entry.uid === cardUid ? { ...entry, upgraded: true } : entry,
      ),
    },
    screen: 'map',
  }));

  return appendLog(next, {
    source: 'safe',
    kind: 'run',
    text: `Forged ${cardTable.find(card.defId)?.name ?? card.defId}.`,
    detail: { card: card.defId },
  });
}

/** Free, once, at a Safe Planet. The anti-bloat valve has to be reliable. */
export function safePlanetRemove(state: GameState, cardUid: string): GameState {
  const run = requireRun(state);
  const card = run.pilot.deck.find((entry) => entry.uid === cardUid);
  if (card === undefined || run.pilot.deck.length <= 1) return state;

  const next = withRun(state, (current) => ({
    ...current,
    pilot: {
      ...current.pilot,
      deck: current.pilot.deck.filter((entry) => entry.uid !== cardUid),
    },
    screen: 'map',
  }));

  return appendLog(next, {
    source: 'safe',
    kind: 'run',
    text: `Stripped ${cardTable.find(card.defId)?.name ?? card.defId}.`,
    detail: { card: card.defId },
  });
}

export function safePlanetTrade(state: GameState): GameState {
  const run = requireRun(state);
  if (run.pilot.health <= ECONOMY.refuelHullCost) return state;

  const bled = withRun(state, (current) => ({
    ...current,
    pilot: { ...current.pilot, health: current.pilot.health - ECONOMY.refuelHullCost },
  }));
  const paid = gainAlloy(bled, ECONOMY.refuelAlloyGain, 'safe');

  return appendLog(withRun(paid, (current) => ({ ...current, screen: 'map' })), {
    source: 'safe',
    kind: 'run',
    text: `Bled ${ECONOMY.refuelHullCost} for ${ECONOMY.refuelAlloyGain} Alloy.`,
    detail: null,
  });
}

/* ---------- the Station ----------
   Repair only at M2. Cards, modules and the removal counter arrive at M4. */

export function stationRepair(state: GameState, amount: number): GameState {
  const run = requireRun(state);
  const wanted = Math.max(0, Math.min(amount, run.pilot.maxHealth - run.pilot.health));
  const cost = wanted * ECONOMY.hullRepairPerPoint;
  if (wanted === 0 || run.alloy < cost) return state;

  const paid = spendAlloy(state, cost, 'station');
  const next = withRun(paid, (current) => ({
    ...current,
    pilot: { ...current.pilot, health: current.pilot.health + wanted },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Patched ${wanted} for ${cost} Alloy.`,
    detail: { repaired: wanted, cost },
  });
}

export function leaveNode(state: GameState): GameState {
  return withRun(state, (run) => ({ ...run, screen: 'map' }));
}

/** The cost of the next removal at a Station. Rises with each one bought. */
export function nextRemovalCost(run: RunState): number {
  return removalCost(run.removalsPurchased);
}

export const STARTING_DECK_SIZE = PLAYER.startingDeckSize;
