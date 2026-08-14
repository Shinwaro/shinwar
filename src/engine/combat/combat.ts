/* The combat loop.
 *
 *   startPlayerTurn -> play cards -> endPlayerTurn -> resolveHeat -> enemyTurns -> next turn
 *
 * Every step is pure and every step logs. The order inside `endPlayerTurn` is
 * load-bearing and is spelled out where it happens.
 */

import type { CardDef, CardInstance, GameState, StanceId } from '../types.ts';
import { appendLog, requireCombat, requireRun, withCombat, withRun } from '../state.ts';
import { fireHook } from '../hooks.ts';
import { shuffle } from '../rng.ts';
import { HEAT, PLAYER as PLAYER_BALANCE, STANCES, STARTING_STANCE } from '../../content/balance.ts';
import { cards as cardTable, enemies as enemyTable } from '../../content/registry.ts';
import { ENCOUNTERS } from '../../content/encounters.ts';
import { PLAYER, enemyTarget, livingEnemies } from './damage.ts';
import { applyEffects, createContext, retireCard } from './effects.ts';
import { gainHeat, resolveOverheat, ventHeat } from './heat.ts';
import { decayStatuses } from './keywords.ts';
import { mintEnemy } from './instances.ts';
import { discardHand, draw, findInHand, moveToDiscard, narrateDraw } from './piles.ts';
import { telegraphAll } from './intents.ts';

/* ---------- setup ---------- */

/** The upgraded definition, or the plain one. Cards never carry two shapes at runtime. */
export function definitionOf(card: CardInstance): CardDef {
  const base = cardTable.get(card.defId);
  if (!card.upgraded) return base;
  return { ...base, ...base.upgrade };
}

export function costOf(card: CardInstance): number {
  const cost = definitionOf(card).cost;
  return cost === 'X' ? 0 : cost;
}

/**
 * Begin a fight. Shuffles the run deck into the draw pile on the `combat`
 * stream, seats the enemies, then hands over to the first player turn.
 */
export function startCombat(state: GameState, encounterId: string, environmentId: string): GameState {
  const run = requireRun(state);
  const encounter = ENCOUNTERS.find((entry) => entry.id === encounterId);
  if (encounter === undefined) throw new Error(`combat: no encounter '${encounterId}'`);

  let counter = run.uidCounter;
  const enemies = encounter.enemyIds.map((enemyId) => {
    const minted = mintEnemy(counter, enemyTable.get(enemyId));
    counter = minted.uidCounter;
    return minted.value;
  });

  const shuffled = shuffle(run.rng, 'combat', run.pilot.deck);

  // Innate cards start in hand rather than in the shuffle — that is the whole
  // promise of the keyword, and it has to survive the shuffle to mean anything.
  const innate = shuffled.value.filter((card) => definitionOf(card).innate === true);
  const rest = shuffled.value.filter((card) => definitionOf(card).innate !== true);

  const seated: GameState = withRun(state, (current) => ({
    ...current,
    uidCounter: counter,
    rng: shuffled.rng,
    combat: {
      encounterId,
      environmentId,
      turn: 0,
      round: 0,
      stance: STARTING_STANCE,
      heat: HEAT.min,
      energy: 0,
      block: 0,
      focus: 0,
      statuses: [],
      draw: rest,
      hand: innate,
      discard: [],
      exhaust: [],
      enemies,
      cardsPlayedThisTurn: 0,
      blockGainedThisTurn: 0,
      attacksThisTurn: 0,
      energyPenaltyNextTurn: 0,
      outcome: 'ongoing',
    },
  }));

  const announced = appendLog(seated, {
    source: 'system',
    kind: 'combat',
    text: `Contact: ${enemies.map((enemy) => enemyTable.get(enemy.defId).name).join(', ')}.`,
    detail: { encounterId, environmentId },
  });

  return startPlayerTurn(fireHook(announced, 'onCombatStart', { encounterId, environmentId }));
}

/* ---------- the player's turn ---------- */

export function startPlayerTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  if (combat.outcome !== 'ongoing') return state;

  const stance = STANCES[combat.stance];
  const turn = combat.turn + 1;

  // Block is lost at the start of your turn, except what GUARD retains. Energy
  // is refilled, less anything a critical overheat took.
  const energy = Math.max(0, PLAYER_BALANCE.energyPerTurn - combat.energyPenaltyNextTurn);

  let next = withCombat(state, (current) => ({
    ...current,
    turn,
    round: current.round + 1,
    block: Math.min(current.block, stance.blockRetained),
    energy,
    energyPenaltyNextTurn: 0,
    cardsPlayedThisTurn: 0,
    blockGainedThisTurn: 0,
    attacksThisTurn: 0,
  }));

  next = appendLog(next, {
    source: 'system',
    kind: 'combat',
    text: `Turn ${turn}. ${stance.name}: ${stance.text}`,
    detail: { turn, stance: combat.stance },
  });

  // Intents commit here, before the player has any information to act on and
  // before they can act at all.
  next = telegraphAll(next);

  next = fireHook(next, 'onRoundStart', { round: requireCombat(next).round });
  next = fireHook(next, 'onTurnStart', { turn });

  return drawForTurn(next);
}

function drawForTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  const count = PLAYER_BALANCE.drawPerTurn + STANCES[combat.stance].extraDraw;
  const run = requireRun(state);
  if (run.combat === null) return state;

  const result = draw(run.combat, run.rng, count);
  const next = withRun(state, (current) => ({ ...current, rng: result.rng, combat: result.combat }));
  return narrateDraw(next, result, 'system', false);
}

/* ---------- playing a card ---------- */

export interface PlayCheck {
  readonly ok: boolean;
  /** Why not, in words the UI can show without inventing its own. */
  readonly reason: string | null;
}

export function canPlay(state: GameState, cardUid: string): PlayCheck {
  const combat = state.run?.combat ?? null;
  if (combat === null) return { ok: false, reason: 'No combat in progress.' };
  if (combat.outcome !== 'ongoing') return { ok: false, reason: 'The fight is over.' };
  const card = findInHand(combat, cardUid);
  if (card === undefined) return { ok: false, reason: 'That card is not in your hand.' };
  const cost = costOf(card);
  if (cost > combat.energy) {
    return { ok: false, reason: `Needs ${cost} Energy, you have ${combat.energy}.` };
  }
  return { ok: true, reason: null };
}

/**
 * Does this card need the player to pick an enemy before it can resolve?
 *
 * Stance-aware on purpose. Solar Parry is pure Block in IAI and only reaches
 * for an enemy under its GUARD rider — asking a defensive card to be aimed in
 * the stance where it does nothing to anyone is friction with no decision
 * behind it. Pass the stance the card would resolve in.
 */
export function needsTarget(def: CardDef, stance: StanceId): boolean {
  const wants = (op: { readonly op: string; readonly target?: string }): boolean =>
    op.target === 'enemy' || op.target === 'chosenEnemy';

  const walk = (ops: readonly CardDef['effects'][number][]): boolean =>
    ops.some((op) => {
      if (wants(op)) return true;
      if (op.op === 'conditional') return walk(op.then) || walk(op.else ?? []);
      if (op.op === 'scaleWith') return walk(op.then);
      return false;
    });

  if (walk(def.effects)) return true;

  const rider = def.stanceRider;
  if (rider === undefined || rider.stance !== stance) return false;
  return walk(rider.effects);
}

export function playCard(state: GameState, cardUid: string, targetUid: string | null): GameState {
  const check = canPlay(state, cardUid);
  if (!check.ok) return state;

  const combat = requireCombat(state);
  const card = findInHand(combat, cardUid);
  if (card === undefined) return state;

  const def = definitionOf(card);
  const cost = costOf(card);
  const target = targetUid === null ? null : enemyTarget(targetUid);

  // Leave the hand and pay before resolving, so a card that draws cards cannot
  // draw itself and a card that discards cannot discard itself.
  let next = withCombat(state, (current) => ({
    ...moveToDiscard(current, card),
    energy: current.energy - cost,
    cardsPlayedThisTurn: current.cardsPlayedThisTurn + 1,
  }));

  next = appendLog(next, {
    source: def.id,
    kind: 'card',
    text: `Played ${def.name}${cost > 0 ? ` (${cost} Energy)` : ''}.`,
    detail: { card: def.id, cost },
  });

  const context = createContext(def.id, PLAYER, target);
  let result = applyEffects(next, def.effects, context);

  // The rider resolves after the base effect, and only in its stance.
  const rider = def.stanceRider;
  if (rider !== undefined && requireCombat(result.state).stance === rider.stance) {
    result = applyEffects(result.state, rider.effects, result.context);
  }

  next = retireCard(result.state, card, result.context.exhaustSelf || def.exhaust === true);
  next = fireHook(next, 'onCardPlayed', { cardUid: card.uid, cardId: def.id });

  return checkOutcome(next);
}

/* ---------- ending the turn ---------- */

/**
 * Order matters and is deliberate:
 *
 *   1. the stance passive (IAI cooks you, GUARD vents)
 *   2. the overheat check
 *   3. discard the hand
 *   4. the enemies act on what they telegraphed
 *   5. statuses decay
 *
 * The stance passive runs BEFORE the overheat check, so IAI's +1 can be the
 * point that tips you over. That is the bargain IAI offers, and hiding it
 * behind the check would make the stance strictly better than it reads.
 */
export function endPlayerTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  if (combat.outcome !== 'ongoing') return state;

  const stance = STANCES[combat.stance];
  let next = state;

  if (stance.heatAtTurnEnd > 0) next = gainHeat(next, stance.heatAtTurnEnd, stance.name);
  if (stance.ventAtTurnEnd > 0) next = ventHeat(next, stance.ventAtTurnEnd, stance.name);

  next = fireHook(next, 'onTurnEnd', { turn: requireCombat(next).turn });
  next = resolveOverheat(next);

  next = checkOutcome(next);
  if (requireCombat(next).outcome !== 'ongoing') return next;

  next = withCombat(next, discardHand);
  next = enemyTurns(next);

  next = checkOutcome(next);
  if (requireCombat(next).outcome !== 'ongoing') return next;

  next = withCombat(next, (current) => ({
    ...current,
    statuses: decayStatuses(current.statuses),
    enemies: current.enemies.map((enemy) => ({ ...enemy, statuses: decayStatuses(enemy.statuses) })),
  }));

  next = fireHook(next, 'onRoundEnd', { round: requireCombat(next).round });

  return startPlayerTurn(next);
}

function enemyTurns(state: GameState): GameState {
  let next = state;

  for (const seated of requireCombat(state).enemies) {
    if (requireCombat(next).outcome !== 'ongoing') break;

    const enemy = requireCombat(next).enemies.find((entry) => entry.uid === seated.uid);
    if (enemy === undefined || enemy.hp <= 0 || enemy.intentMoveId === null) continue;

    const def = enemyTable.get(enemy.defId);
    const move = def.moves.find((entry) => entry.id === enemy.intentMoveId);
    if (move === undefined) continue;

    // Enemy Block, like the player's, is gone by the time it acts again.
    next = withCombat(next, (current) => ({
      ...current,
      enemies: current.enemies.map((entry) => (entry.uid === enemy.uid ? { ...entry, block: 0 } : entry)),
    }));

    next = appendLog(next, {
      source: enemy.uid,
      kind: 'combat',
      text: `${def.name}: ${move.label}.`,
      detail: { enemy: def.id, move: move.id },
    });

    const context = createContext(enemy.uid, enemyTarget(enemy.uid), PLAYER);
    next = applyEffects(next, move.effects, context).state;

    // Spent. A cleared intent is also how the UI knows not to draw a stale one.
    next = withCombat(next, (current) => ({
      ...current,
      enemies: current.enemies.map((entry) =>
        entry.uid === enemy.uid ? { ...entry, intentMoveId: null } : entry,
      ),
    }));
  }

  return next;
}

/* ---------- outcome ---------- */

export function checkOutcome(state: GameState): GameState {
  const combat = state.run?.combat ?? null;
  if (combat === null || combat.outcome !== 'ongoing') return state;

  if ((state.run?.pilot.health ?? 0) <= 0) {
    return withCombat(state, (current) => ({ ...current, outcome: 'lost' as const }));
  }
  if (livingEnemies(combat).length === 0) {
    return withCombat(state, (current) => ({ ...current, outcome: 'won' as const }));
  }
  return state;
}

/**
 * Close out a finished fight: fire `onCombatEnd`, and settle the run. At M1
 * there is no map for a win to lead to, so a win ends the run — M2 replaces
 * this with the return to the map.
 */
export function concludeCombat(state: GameState): GameState {
  const combat = state.run?.combat ?? null;
  if (combat === null || combat.outcome === 'ongoing') return state;

  const won = combat.outcome === 'won';
  let next = fireHook(state, 'onCombatEnd', { outcome: combat.outcome });
  next = appendLog(next, {
    source: 'system',
    kind: 'combat',
    text: won ? 'Contact cleared.' : 'Hull breached. The run ends here.',
    detail: { outcome: combat.outcome },
  });

  return {
    ...next,
    phase: 'over',
    run: next.run === null ? null : { ...next.run, outcome: won ? 'won' : 'died' },
  };
}

/** The stance strip's text, straight from the table. The UI never writes its own. */
export function stanceText(stance: StanceId): string {
  return STANCES[stance].text;
}
