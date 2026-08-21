/* The run loop — everything between fights.
 *
 * Entering a node, resolving what it turns out to be, paying out rewards, and
 * the Safe Planet menu. The reducer calls in here; nothing in here reaches
 * back out to the reducer.
 */

import type {
  CardId,
  GameState,
  MapNode,
  ResolvedThread,
  RunState,
  WavefrontState,
} from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { nextIntInclusive, weightedPick } from '../rng.ts';
import { generateMap } from '../map/mapgen.ts';
import { canMoveTo, nodeById } from '../map/route.ts';
import { startCombat } from '../combat/combat.ts';
import { mintCard } from '../combat/instances.ts';
import { gainAlloy, removalCost, rollAlloy, spendAlloy } from './economy.ts';
import { offerMatchesLean, rollReward } from './rewards.ts';
import { applyRunEffects } from './effects.ts';
import { clearEvent, openEvent } from './events.ts';
import { advanceThreads, dueThreads, resolveThread } from './threads.ts';
import { stockShop } from './shop.ts';
import {
  ACT_CLEAR_HEAL_PCT,
  BOSS_MAX_HEALTH,
  ECONOMY,
  PLAYER,
  TREASURE_ALLOY,
  UNKNOWN_WEIGHTS,
  WAVEFRONT,
} from '../../content/balance.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import {
  cards as cardTable,
  enemies as enemyTable,
  relics as relicTable,
} from '../../content/registry.ts';
import { ENCOUNTERS as encounterTable } from '../../content/encounters.ts';
import { describeLanding } from './describe.ts';

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
    shop: null,
    wavefront: startingWavefront(current.act),
  }));
}

/** The front only exists from Act 2. Act 1 is for learning the stance layer. */
function startingWavefront(act: 1 | 2 | 3): WavefrontState | null {
  if (act < WAVEFRONT.firstAct) return null;
  return { time: 0, row: -WAVEFRONT.grace, hazardPending: false };
}

/**
 * The act is over. Move up rather than end the run.
 *
 * Everything the player built carries: deck, ship, Alloy, Masteries, and any
 * Thread still outstanding. What resets is the map, the shop, and the front —
 * a new act is a new sky, not a new run.
 */
export function advanceAct(state: GameState): GameState {
  const run = requireRun(state);
  if (run.act >= 3) return state;
  const act = (run.act + 1) as 1 | 2 | 3;

  /* Beating an act is worth two things, and they are different things.
     The ceiling goes up — a card reward can be diluted by the deck it joins,
     this cannot, and it is the one beat that reads as "I am more than I was"
     rather than "I have more than I had". And some of what is under the
     ceiling comes back: arriving in a new sky on whatever the boss left you
     made a won fight feel like a loss with extra steps. */
  const maxHealth = run.pilot.maxHealth + BOSS_MAX_HEALTH;
  const patched = Math.floor(maxHealth * ACT_CLEAR_HEAL_PCT);

  const moved = withRun(state, (current) => ({
    ...current,
    act,
    combat: null,
    pendingReward: null,
    forcedTier: null,
    pilot: {
      ...current.pilot,
      maxHealth,
      health: Math.min(maxHealth, current.pilot.health + BOSS_MAX_HEALTH + patched),
    },
  }));

  return appendLog(openMap(moved), {
    source: 'system',
    kind: 'run',
    text: `Act ${act}. Hull patched for ${patched}, and the frontier gets thinner from here.`,
    detail: { act, healed: patched, maxHealth },
  });
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
  next = advanceWavefront(next, node);
  const settled = settleThreads(next, node);
  next = settled.state;

  return openLanding(next, node, settled.resolved);
}

/**
 * The collapse front takes a step.
 *
 * Every node costs time; a Station or a Safe Planet costs double. Since you
 * only ever advance one row per node, that doubling is the whole mechanism —
 * each detour literally hands the front a row of your lead. It never blocks a
 * route and it never kills you: catching up only means the next fight starts
 * worse, which keeps it a problem to solve rather than a verdict.
 */
function advanceWavefront(state: GameState, node: MapNode): GameState {
  const run = requireRun(state);
  const front = run.wavefront;
  if (front === null) return state;

  const stop = node.type === 'station' || node.type === 'safe';
  const time = front.time + (stop ? WAVEFRONT.timeAtStop : WAVEFRONT.timePerNode);
  const row = time - WAVEFRONT.grace;
  const caught = row >= node.row && node.encounterId !== null;

  const moved = withRun(state, (current) => ({
    ...current,
    wavefront: { time, row, hazardPending: caught },
  }));

  if (!caught) return moved;
  return appendLog(moved, {
    source: 'wavefront',
    kind: 'run',
    text: 'The front reaches you. Whatever is here is already burning.',
    detail: { row, node: node.id },
  });
}

/**
 * Move every carried Thread one node closer, and pay out the ones that arrive.
 *
 * The boss is exempt from reprisals only — a Thread coming due there still pays
 * out, it just cannot replace the act finale. The boss must be a culmination,
 * not a curveball, and being jumped by a bill instead of fighting it is the
 * definition of a curveball.
 */
function settleThreads(
  state: GameState,
  node: MapNode,
): { state: GameState; resolved: ResolvedThread[] } {
  let next = advanceThreads(state);
  const resolved: ResolvedThread[] = [];

  for (const def of dueThreads(requireRun(next))) {
    next = resolveThread(next, def.id);
    const paid = applyRunEffects(next, def.payoff, def.id);
    next = paid.state;
    /*
     * The promise travels with the payout.
     *
     * A Thread that simply happens is indistinguishable from the game being
     * arbitrary — the player has to be able to draw the line back to the choice
     * they made five nodes ago, or there is nothing to learn from either end.
     * Deliberately vague when taken, completely explicit when it lands.
     */
    resolved.push({
      threadId: def.id,
      name: def.name,
      promise: def.description,
      lines: paid.lines,
      tone: def.tone,
    });
  }

  if (node.type === 'boss' && requireRun(next).forcedTier !== null) {
    next = withRun(next, (current) => ({ ...current, forcedTier: null }));
  }

  return { state: next, resolved };
}

/**
 * The beat between clicking a place and the place happening.
 *
 * A node used to resolve on the click, so arriving somewhere with nothing in it
 * was indistinguishable from a misclick: the map simply came back. Naming the
 * place and saying what is on it — including when the answer is "nothing" —
 * turns every node into somewhere you went rather than a button you pressed.
 */
function openLanding(
  state: GameState,
  node: MapNode,
  resolved: readonly ResolvedThread[],
): GameState {
  const encounter = node.encounterId === null ? undefined : encounterTable.find((entry) => entry.id === node.encounterId);
  const names = (encounter?.enemyIds ?? []).map((id) => enemyTable.find(id)?.name ?? id);

  return withRun(state, (run) => ({
    ...run,
    screen: 'landing' as const,
    landing: { nodeId: node.id, title: node.name, body: describeLanding(node, names), resolved },
  }));
}

/** Leave the arrival screen. The node becomes whatever it is. */
export function leaveLanding(state: GameState): GameState {
  const run = requireRun(state);
  const landing = run.landing;
  if (landing === null) return state;

  const node = run.map === null ? undefined : nodeById(run.map, landing.nodeId);
  const cleared = withRun(state, (current) => ({ ...current, landing: null }));
  if (node === undefined) return withRun(cleared, (current) => ({ ...current, screen: 'map' }));

  // A Thread's reprisal still takes the node, and it is announced on the way in
  // rather than discovered on arrival at a fight you did not choose.
  if (requireRun(cleared).forcedTier !== null) {
    return openCombat(cleared, { ...node, type: 'combat' });
  }
  return resolveNode(cleared, node);
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
      return withRun(stockShop(state, node.id), (run) => ({ ...run, screen: 'station' }));

    case 'unknown':
      return resolveUnknown(state, node);

    case 'event':
      return openEvent(state);

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

  if (rolled.value === 'event') return openEvent(spun);

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
  const run = requireRun(state);
  const encounterId = node.encounterId ?? fallbackEncounter(run);
  if (encounterId === null) {
    // Nothing to fight. Better an empty node than a thrown error mid-run.
    return withRun(state, (current) => ({ ...current, screen: 'map' }));
  }
  const staged = withRun(state, (current) => ({ ...current, screen: 'combat' }));
  return startCombat(staged, encounterId, node.environmentId ?? CLEAR_SPACE_ID);
}

function fallbackEncounter(run: RunState): string | null {
  const map = run.map;
  const any = map?.nodes.find((node) => node.encounterId !== null)?.encounterId;
  return any ?? null;
}

/**
 * Close an Anomaly. Back to the map, unless the choice turned out to have
 * something waiting behind it — then the fight opens straight from the screen.
 */
export function leaveEvent(state: GameState): GameState {
  const run = requireRun(state);
  if (run.pendingEvent === null) return state;

  const cleared = clearEvent(state);
  const after = requireRun(cleared);
  if (after.forcedTier === null) return cleared;

  const node = after.position === null || after.map === null ? undefined : nodeById(after.map, after.position);
  if (node === undefined) return withRun(cleared, (current) => ({ ...current, forcedTier: null }));
  return openCombat(cleared, { ...node, type: 'combat' });
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
  // A Thread's reprisal pays what a reprisal is worth, not what the node it
  // stole was worth. Spent here, so it can never leak into a second fight.
  const tier =
    run.forcedTier ?? (node?.type === 'boss' ? 'boss' : node?.type === 'elite' ? 'elite' : 'combat');

  const alloy = rollAlloy(run.rng, tier);
  let next = withRun(state, (current) => ({
    ...current,
    rng: alloy.rng,
    combat: null,
    forcedTier: null,
  }));

  const rolled = rollReward(requireRun(next).rng, requireRun(next), run.act, alloy.value, run.rewardDrought, tier);
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
    return grantRelic(
      appendLog(
        withRun(state, (current) => ({ ...current, pendingReward: null, screen: 'map' })),
        { source: 'reward', kind: 'reward', text: 'Took nothing.', detail: null },
      ),
      offer.takenRelic,
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

  return grantRelic(
    appendLog(next, {
      source: 'reward',
      kind: 'reward',
      text: `Took ${def.name}.`,
      detail: { card: chosen },
    }),
    offer.takenRelic,
  );
}

/** Take the relic chosen from the act finale's three. */
function grantRelic(state: GameState, relicId: string | null): GameState {
  if (relicId === null) return state;
  const run = requireRun(state);
  if (run.pilot.relics.includes(relicId)) return state;
  const def = relicTable.find(relicId);
  if (def === undefined) return state;

  let next = withRun(state, (current) => ({
    ...current,
    pilot: { ...current.pilot, relics: [...current.pilot.relics, relicId] },
  }));

  // `maxHealth` is the one passive that is not read continuously — it is a
  // one-off change to the pilot, applied here and never again.
  const extra = def.passive?.maxHealth ?? 0;
  if (extra !== 0) {
    next = withRun(next, (current) => ({
      ...current,
      pilot: {
        ...current.pilot,
        maxHealth: Math.max(1, current.pilot.maxHealth + extra),
        health: Math.max(1, current.pilot.health + Math.max(0, extra)),
      },
    }));
  }

  return appendLog(next, {
    source: relicId,
    kind: 'reward',
    text: `${def.name}. ${def.text}`,
    detail: { relic: relicId },
  });
}

/** Choose one of the act finale's relics — or change your mind, until you leave. */
export function takeRewardRelic(state: GameState, relicId: string): GameState {
  const run = requireRun(state);
  const offer = run.pendingReward;
  if (offer === null || !offer.relicIds.includes(relicId)) return state;

  const already = offer.takenRelic === relicId;
  return withRun(state, (current) => ({
    ...current,
    pendingReward:
      current.pendingReward === null
        ? null
        : { ...current.pendingReward, takenRelic: already ? null : relicId },
  }));
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
   Patching the ronin. Stock, prices and buying live in `shop.ts`. */

/**
 * One patch-up, a fixed fraction of max health, once per Station.
 *
 * It used to be a slider at 1 Alloy a point — a full heal for 70, cheaper than
 * a common card, which made health a thing you bought back rather than a thing
 * you spent. Now it costs what an implant costs and you get half of what you
 * are missing capacity for, so arriving hurt is a real problem and the Station
 * is a real choice rather than a reset button.
 */
export function stationRepair(state: GameState): GameState {
  const run = requireRun(state);
  const shop = run.shop;
  if (shop === null || shop.repairUsed || run.alloy < shop.repairPrice) return state;

  const amount = Math.round(run.pilot.maxHealth * ECONOMY.repairPct);
  const healed = Math.min(run.pilot.maxHealth, run.pilot.health + amount);
  const gained = healed - run.pilot.health;
  if (gained === 0) return state;

  const paid = spendAlloy(state, shop.repairPrice, 'station');
  const next = withRun(paid, (current) => ({
    ...current,
    pilot: { ...current.pilot, health: healed },
    shop: current.shop === null ? null : { ...current.shop, repairUsed: true },
  }));

  return appendLog(next, {
    source: 'station',
    kind: 'run',
    text: `Patched ${gained} for ${shop.repairPrice} Alloy.`,
    detail: { repaired: gained, cost: shop.repairPrice },
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
