/* The bot.
 *
 * A heuristic player, not a good one. That is deliberate: the bar a fight has
 * to clear is "a competent player who is not solving it perfectly", and a bot
 * tuned into a perfect solver measures the solver rather than the game. What it
 * must be is *consistent*, so a change in the numbers it reports is a change in
 * the game and not a change in its mood.
 *
 * It only ever dispatches actions. Every decision goes through `applyAction`
 * exactly as a click would, so anything it reports is something a player can
 * meet — and a refused action is a bug in here, not something to route around.
 *
 * Deterministic throughout. Its own choices come off a counter hashed with the
 * run seed rather than `Math.random`, so `npm run sim` twice in a row prints the
 * same numbers and a diff in the report is a diff in the game.
 */

import type { CardInstance, EventDef, GameState, MapNode, RunState } from '../src/engine/types.ts';
import { applyAction } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { canPlay, definitionOf, needsTarget } from '../src/engine/combat/combat.ts';
import { previewCard } from '../src/engine/combat/preview.ts';
import { incomingDamage } from '../src/engine/combat/intents.ts';
import { livingEnemies } from '../src/engine/combat/damage.ts';
import { overheatThreshold } from '../src/engine/combat/heat.ts';
import { liveStance } from '../src/engine/combat/rules.ts';
import { availableMoves, nodeById } from '../src/engine/map/route.ts';
import { optionsFor, canTakeOption } from '../src/engine/run/events.ts';
import { archetypeLean } from '../src/engine/run/rewards.ts';
import {
  cards as cardTable,
  events as eventTable,
  implants as implantTable,
} from '../src/content/registry.ts';
import { ACTIVE_STANCES } from '../src/content/balance.ts';

function eventDefOf(id: string): EventDef | null {
  return eventTable.find(id) ?? null;
}

/* ---------- a deterministic coin ----------
   Not `Math.random`: two identical sim runs must print identical reports, or
   the report cannot be diffed and the whole point of running it is gone. */

let tick = 0;

export function resetBotEntropy(seed: string): void {
  tick = 0;
  for (let i = 0; i < seed.length; i++) tick = (tick * 31 + seed.charCodeAt(i)) >>> 0;
}

function roll(bound: number): number {
  tick = (tick * 1664525 + 1013904223) >>> 0;
  return tick % Math.max(1, bound);
}

/* ---------- what a run produced ---------- */

export interface RunReport {
  readonly won: boolean;
  readonly actReached: 1 | 2 | 3;
  readonly turns: number;
  readonly encounters: number;
  readonly healthLost: number;
  readonly overheats: number;
  /**
   * Where the health actually went, by node type plus everything that is not a
   * fight at all.
   *
   * Added because the first tuning pass cut Act 1 enemy damage by a third and
   * moved the death rate by three points. A total says attrition is too high; it
   * does not say which encounter is spending it, and the answer turned out not
   * to be the one the totals implied.
   */
  readonly lostBy: Readonly<Record<string, number>>;
  readonly fightsBy: Readonly<Record<string, number>>;
  /** Card ids offered on a reward screen, and the ones actually taken. */
  readonly offered: readonly string[];
  readonly taken: readonly string[];
  /** Deck at the end, for pick-rate-against-win-rate. */
  readonly finalDeck: readonly string[];
  /** Environments fought in, for the per-environment delta. */
  readonly environments: readonly string[];
  /**
   * The power curve, measured rather than assumed.
   *
   * Robin's diagnosis was that nothing changes between the first fight and the
   * first boss — you are the same character with a bigger deck. These are the
   * numbers that say whether that is still true, and a deck that grows while
   * none of the others move is the shape of the problem.
   */
  readonly relics: number;
  readonly implants: number;
  readonly deckSize: number;
  readonly upgraded: number;
  readonly maxHealth: number;
  readonly masteries: number;
  readonly outcome: 'won' | 'died' | 'stuck';
}

const MAX_ACTIONS = 40_000;

/* ---------- combat ---------- */

function handOf(run: RunState): readonly CardInstance[] {
  return run.combat?.hand ?? [];
}

/**
 * How much this card is worth playing right now.
 *
 * Lethal first, then whatever the fight actually needs — block when a hit is
 * coming that will land, damage otherwise. Heat is priced rather than forbidden:
 * going over the line is allowed when the card is good enough, which is the
 * decision the mechanic exists to pose.
 */
function scoreCard(state: GameState, card: CardInstance, targetUid: string | null): number {
  const run = state.run;
  const combat = run?.combat;
  if (run === undefined || run === null || combat === undefined || combat === null) return -1;

  const preview = previewCard(state, card.uid, targetUid);
  if (!preview.playable) return -1;

  const def = definitionOf(card);
  let score = 0;

  /*
   * Damage is scored against what the target actually has left, not raw.
   *
   * Two things fall out of that and both matter. Overkill stops counting, so a
   * 14-damage card is not "better" for being pointed at something with 3 hp
   * left. And progress toward a kill is worth more than the same damage spread
   * across two enemies — every enemy removed is its whole intent removed from
   * every future turn, which is the single largest lever in a fight against
   * more than one thing.
   */
  const living = livingEnemies(combat);
  let damage = 0;
  let kills = 0;
  for (const hit of preview.enemies) {
    const enemy = living.find((entry) => entry.uid === hit.uid);
    if (enemy === undefined) continue;
    const effective = Math.min(hit.hpLoss, enemy.hp);
    damage += effective;
    score += (effective / Math.max(1, enemy.maxHp)) * 9;
    if (hit.willDie) kills += 1;
  }

  score += damage * 1.0;
  score += kills * 26; // ending a fight a turn early is worth more than the damage says

  // Block only counts up to what is actually coming. Over-blocking is a card
  // spent on nothing, and a bot that hoards Block reports fights as safer than
  // they are.
  const incoming = incomingDamage(state);
  const useful = Math.max(0, Math.min(preview.blockGain, incoming - combat.block));
  score += useful * 1.15;
  score += Math.max(0, preview.blockGain - useful) * 0.1;

  score += preview.drawCount * 5;
  score += preview.focusDelta * (liveStance(state).spendsFocus ? 1.5 : 3.5);

  // Heat: cheap below the line, expensive across it.
  const threshold = overheatThreshold(state);
  const after = combat.heat + preview.heatDelta;
  if (preview.heatDelta > 0) {
    score -= preview.heatDelta * 1.2;
    if (after >= threshold && combat.heat < threshold) score -= 26;
  } else if (preview.heatDelta < 0) {
    // Venting is worth something only when there is heat worth venting.
    score += Math.min(-preview.heatDelta, combat.heat) * 1.6;
  }

  score -= preview.energyCost * 2.2;
  if (def.exhaust === true) score -= 4;

  return score;
}

interface Move {
  readonly cardUid: string;
  readonly targetUid: string | null;
  readonly score: number;
}

function bestMove(state: GameState): Move | null {
  const run = state.run;
  const combat = run?.combat;
  if (run === undefined || run === null || combat === undefined || combat === null) return null;

  const targets = livingEnemies(combat);
  if (targets.length === 0) return null;

  let best: Move | null = null;
  for (const card of handOf(run)) {
    if (!canPlay(state, card.uid).ok) continue;
    const def = definitionOf(card);
    const options: (string | null)[] = needsTarget(def, combat.stance)
      ? targets.map((enemy) => enemy.uid)
      : [null];

    for (const targetUid of options) {
      const score = scoreCard(state, card, targetUid);
      if (score <= 0) continue;
      if (best === null || score > best.score) best = { cardUid: card.uid, targetUid, score };
    }
  }
  return best;
}

/**
 * Change stance, or don't.
 *
 * The one strategic decision the stance layer poses: bank in GUARD while the
 * stack climbs, then step into IAI and spend it. The bot uses a flat threshold
 * rather than anything clever — if it needed to be clever to be worth doing,
 * that would itself be the finding.
 */
function wantsStanceChange(state: GameState): boolean {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return false;
  if (ACTIVE_STANCES.length < 2) return false;
  if (combat.stanceChangesThisTurn > 0) return false;

  const stance = liveStance(state);
  const threshold = overheatThreshold(state);

  // Too hot to stand in IAI. Step out and vent.
  if (stance.spendsFocus && combat.heat >= threshold - 2) return true;
  // A stack worth cashing, and room to cash it.
  if (!stance.spendsFocus && combat.focus >= 3 && combat.heat < threshold - 2) return true;
  return false;
}

function fight(state: GameState, report: Mutable): GameState {
  let next = state;
  let guard = 0;

  while (next.run?.combat?.outcome === 'ongoing' && guard++ < 400) {
    const combat = next.run.combat;
    report.turns += 1;

    const heatBefore = combat.heat;

    if (wantsStanceChange(next)) {
      const changer = handOf(next.run).find((card) => {
        const preview = previewCard(next, card.uid, null);
        return preview.playable && preview.stanceChanges;
      });
      if (changer !== undefined) next = applyAction(next, { kind: 'playCard', cardUid: changer.uid, targetUid: null });
    }

    let plays = 0;
    while (plays++ < 20) {
      const move = bestMove(next);
      if (move === null) break;
      const before = next;
      next = applyAction(next, { kind: 'playCard', cardUid: move.cardUid, targetUid: move.targetUid });
      // A refused action would spin this loop forever. It also means the bot
      // asked for something the UI could not, which is worth knowing about.
      if (next === before) break;
      if (next.run?.combat?.outcome !== 'ongoing') break;
    }

    if (next.run?.combat?.outcome !== 'ongoing') break;

    next = applyAction(next, { kind: 'endTurn' });

    // Enemies resolve one at a time, the way the screen dispatches them.
    let enemyGuard = 0;
    while (next.run?.combat?.outcome === 'ongoing' && enemyGuard++ < 20) {
      const before = next;
      next = applyAction(next, { kind: 'advanceEnemies' });
      if (next === before) break;
    }

    const after = next.run?.combat;
    if (after !== undefined && after !== null && after.heat < heatBefore && heatBefore >= overheatThreshold(next)) {
      report.overheats += 1;
    }
  }

  return next;
}

/* ---------- between fights ---------- */

/** Which way to go. Cheap heuristics; the point is that it routes at all. */
function chooseNode(run: RunState, options: readonly MapNode[]): MapNode {
  const hurt = run.pilot.health / Math.max(1, run.pilot.maxHealth);

  let best = options[0] as MapNode;
  let bestScore = -Infinity;

  for (const node of options) {
    let score = roll(4); // break ties without preferring the leftmost lane

    // Health is the resource the run actually ends on, so a rest outranks
    // almost anything once there is a dent in it.
    if (node.type === 'safe') score += hurt < 0.85 ? 40 : 10;
    else if (node.type === 'station') score += run.alloy >= 90 ? 24 : 10;
    else if (node.type === 'elite') score += hurt > 0.8 ? 14 : -20;
    else if (node.type === 'unknown') score += 10;
    else if (node.type === 'event') score += 8;
    else score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function takeReward(state: GameState, report: Mutable): GameState {
  const run = state.run;
  if (run === null) return state;
  const offer = run.pendingReward;
  if (offer === null) return state;

  report.offered.push(...offer.cardIds);

  const lean = archetypeLean(run);
  let pick: string | null = null;
  let bestScore = -Infinity;

  for (const cardId of offer.cardIds) {
    const def = cardTable.find(cardId);
    if (def === undefined) continue;
    let score = RARITY_VALUE[def.rarity] ?? 1;
    if (def.archetype === lean) score += 3;
    if (def.archetype === 'neutral') score += 1;
    if (score > bestScore) {
      bestScore = score;
      pick = cardId;
    }
  }

  // A deck that only grows stops drawing what it needs. Past this size the bot
  // starts skipping, which is the same reason a player does.
  const bloated = run.pilot.deck.length >= 26;
  if (pick !== null && !bloated) {
    state = applyAction(state, { kind: 'takeRewardCard', cardId: pick });
    report.taken.push(pick);
  }

  // An act finale offers relics; take the best one going.
  const relic = offer.relicIds[0];
  if (relic !== undefined) state = applyAction(state, { kind: 'takeRewardRelic', relicId: relic });

  return applyAction(state, { kind: 'leaveReward' });
}

const RARITY_VALUE: Readonly<Record<string, number>> = {
  basic: 0,
  common: 2,
  uncommon: 4,
  rare: 7,
  epic: 10,
  legendary: 14,
  artifact: 18,
};

function safePlanet(state: GameState): GameState {
  const run = state.run;
  if (run === null) return state;

  const hurt = run.pilot.health / Math.max(1, run.pilot.maxHealth);
  if (hurt < 0.65) return applyAction(state, { kind: 'safePlanetHeal' });

  const upgradable = run.pilot.deck.find((card) => !card.upgraded);
  if (upgradable !== undefined) {
    return applyAction(state, { kind: 'safePlanetUpgrade', cardUid: upgradable.uid });
  }
  return applyAction(state, { kind: 'safePlanetHeal' });
}

function station(state: GameState): GameState {
  let next = state;
  const run = next.run;
  if (run === null) return next;
  const shop = run.shop;
  if (shop === null) return applyAction(next, { kind: 'leaveNode' });

  // Patch up first: health is the resource the run actually ends on.
  const missing = run.pilot.maxHealth - run.pilot.health;
  if (missing > 12 && run.alloy > 90) {
    next = applyAction(next, { kind: 'stationRepair', amount: Math.min(missing, 25) });
  }

  /*
   * Implants first, and by a distance. An Energy or a card drawn changes every
   * turn of the rest of the run; another card in a 23-card deck changes about
   * one turn in five. A player who understood the shop would spend here first,
   * so the bot does.
   */
  for (const stock of [...shop.implants].sort((a, b) => b.price - a.price)) {
    if (stock.sold) continue;
    const current = next.run;
    if (current === null || current.alloy < stock.price) continue;
    const def = implantTable.find(stock.implantId);
    if (def === undefined) continue;
    if (current.pilot.implants.filter((id) => id === def.id).length >= def.maxStacks) continue;
    next = applyAction(next, { kind: 'buyImplant', implantId: stock.implantId });
  }

  const lean = archetypeLean(run);
  for (const stock of shop.cards) {
    if (stock.sold) continue;
    const def = cardTable.find(stock.cardId);
    if (def === undefined) continue;
    const wants = def.archetype === lean || def.rarity === 'rare' || def.rarity === 'epic';
    if (!wants) continue;
    const before = next;
    next = applyAction(next, { kind: 'buyShopCard', cardId: stock.cardId });
    if (next !== before) break; // one card a stop; the rest is for the removal
  }

  const current = next.run;
  if (current !== null && shop.masteryId !== null && current.alloy >= shop.masteryPrice) {
    next = applyAction(next, { kind: 'buyMastery', masteryId: shop.masteryId });
  }

  const after = next.run;
  if (after !== null && !shop.removalUsed && after.alloy >= shop.removalPrice) {
    // Strip a basic. That is what removal is for.
    const worst = after.pilot.deck.find((card) => cardTable.find(card.defId)?.rarity === 'basic');
    if (worst !== undefined) next = applyAction(next, { kind: 'buyRemoval', cardUid: worst.uid });
  }

  // Forge the best card that is not already forged. A better card beats another
  // card, and unlike a card it does not make the deck harder to draw through.
  const forged = next.run;
  if (forged !== null && !shop.forgeUsed && forged.alloy >= shop.forgePrice) {
    let pick: string | null = null;
    let bestValue = -1;
    for (const card of forged.pilot.deck) {
      if (card.upgraded) continue;
      const value = RARITY_VALUE[cardTable.find(card.defId)?.rarity ?? 'common'] ?? 0;
      if (value > bestValue) {
        bestValue = value;
        pick = card.uid;
      }
    }
    if (pick !== null) next = applyAction(next, { kind: 'buyForge', cardUid: pick });
  }

  return applyAction(next, { kind: 'leaveNode' });
}

function anomaly(state: GameState): GameState {
  const run = state.run;
  if (run === null) return state;
  const pending = run.pendingEvent;
  if (pending === null) return applyAction(state, { kind: 'leaveEvent' });

  // Already chosen — this is the second beat, reading what it cost.
  if (pending.chosenOptionId !== null) return applyAction(state, { kind: 'leaveEvent' });

  const def = eventDefOf(pending.eventId);
  if (def === null) return applyAction(state, { kind: 'leaveEvent' });

  const takeable = optionsFor(run, def).filter((option) => canTakeOption(run, option));
  if (takeable.length === 0) return applyAction(state, { kind: 'leaveEvent' });

  const chosen = takeable[roll(takeable.length)] ?? takeable[0];
  if (chosen === undefined) return applyAction(state, { kind: 'leaveEvent' });
  return applyAction(state, { kind: 'chooseEventOption', optionId: chosen.id });
}

/* ---------- the run ---------- */

interface Mutable {
  turns: number;
  encounters: number;
  overheats: number;
  offered: string[];
  taken: string[];
  environments: string[];
  lostBy: Record<string, number>;
  fightsBy: Record<string, number>;
}

export function playRun(seed: string, depth: number): RunReport {
  resetBotEntropy(seed);

  const report: Mutable = {
    turns: 0,
    encounters: 0,
    overheats: 0,
    offered: [],
    taken: [],
    environments: [],
    lostBy: {},
    fightsBy: {},
  };

  let state = applyAction(
    applyAction(
      applyAction({ ...blank(), phase: 'title' as const }, { kind: 'setSeed', seed }),
      { kind: 'setDepth', depth },
    ),
    { kind: 'beginRun' },
  );

  let healthLost = 0;
  let lastHealth = state.run?.pilot.health ?? 0;
  let actions = 0;
  let stuck = false;

  while (state.phase === 'run' && actions++ < MAX_ACTIONS) {
    const run = state.run;
    if (run === null) break;
    const before = state;

    switch (run.screen) {
      case 'map': {
        const options = availableMoves(run);
        if (options.length === 0) {
          stuck = true;
          break;
        }
        const node = chooseNode(run, options);
        state = applyAction(state, { kind: 'moveToNode', nodeId: node.id });
        break;
      }

      case 'combat': {
        const environmentId = run.combat?.environmentId;
        if (environmentId !== undefined && environmentId !== null) report.environments.push(environmentId);
        report.encounters += 1;

        const here = run.position === null || run.map === null ? null : nodeById(run.map, run.position);
        const kind = run.forcedTier ?? here?.type ?? 'combat';
        report.fightsBy[kind] = (report.fightsBy[kind] ?? 0) + 1;

        const healthBefore = run.pilot.health;
        state = fight(state, report);
        const spent = healthBefore - (state.run?.pilot.health ?? healthBefore);
        report.lostBy[kind] = (report.lostBy[kind] ?? 0) + Math.max(0, spent);
        break;
      }

      case 'reward':
        state = takeReward(state, report);
        break;

      case 'safe':
        state = safePlanet(state);
        break;

      case 'station':
        state = station(state);
        break;

      case 'event':
        state = anomaly(state);
        break;

      default: {
        const unreachable: never = run.screen;
        void unreachable;
        stuck = true;
        break;
      }
    }

    const health = state.run?.pilot.health ?? lastHealth;
    if (health < lastHealth) {
      const delta = lastHealth - health;
      healthLost += delta;
      // Anything spent outside a fight: an Anomaly's price, a Thread's payoff,
      // bleeding at a Safe Planet.
      if (run.screen !== 'combat') report.lostBy['off-screen'] = (report.lostBy['off-screen'] ?? 0) + delta;
    }
    lastHealth = health;

    if (stuck) break;
    // No progress and no screen change means the bot asked for something the
    // engine refused. Bail rather than spin — and say so in the report.
    if (state === before) {
      stuck = true;
      break;
    }
  }

  const finished = state.run;
  const outcome = stuck ? 'stuck' : finished?.outcome === 'won' ? 'won' : 'died';

  return {
    won: outcome === 'won',
    actReached: finished?.act ?? 1,
    turns: report.turns,
    encounters: report.encounters,
    healthLost,
    overheats: report.overheats,
    offered: report.offered,
    taken: report.taken,
    finalDeck: (finished?.pilot.deck ?? []).map((card) => card.defId),
    environments: report.environments,
    relics: finished?.pilot.relics.length ?? 0,
    implants: finished?.pilot.implants.length ?? 0,
    deckSize: finished?.pilot.deck.length ?? 0,
    upgraded: (finished?.pilot.deck ?? []).filter((card) => card.upgraded).length,
    maxHealth: finished?.pilot.maxHealth ?? 0,
    masteries: finished?.pilot.masteries.length ?? 0,
    lostBy: report.lostBy,
    fightsBy: report.fightsBy,
    outcome,
  };
}

/** A title-phase state to start from. */
function blank(): GameState {
  return createInitialState('SIM');
}
