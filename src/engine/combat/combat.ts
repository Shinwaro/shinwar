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
import {
  FOCUS_MAX,
  HEAT,
  PLAYER as PLAYER_BALANCE,
  STARTING_STANCE,
  WAVEFRONT,
} from '../../content/balance.ts';
import {
  cards as cardTable,
  enemies as enemyTable,
  environments as environmentTable,
} from '../../content/registry.ts';
import { CLEAR_SPACE_ID } from '../../content/environments.ts';
import { STRENGTH } from '../../content/statuses.ts';
import { ENCOUNTERS } from '../../content/encounters.ts';
import { PLAYER, enemyTarget, livingEnemies } from './damage.ts';
import { applyEffects, createContext, retireCard } from './effects.ts';
import { gainHeat, resolveOverheat, ventHeat } from './heat.ts';
import { addStacks, clearFresh, decayStatuses, tickStatuses } from './keywords.ts';
import { environmentRules, liveStance, pilotRules, stanceRulesFor } from './rules.ts';
import { mintEnemy } from './instances.ts';
import { discardHand, draw, findInHand, moveToDiscard, narrateDraw } from './piles.ts';
import { telegraphAll } from './intents.ts';

/* ---------- setup ---------- */

/** The upgraded definition, or the plain one. Cards never carry two shapes at runtime. */
export function definitionOf(card: CardInstance): CardDef {
  const base = cardTable.get(card.defId);
  if (!card.upgraded || base.upgrade === undefined) return base;
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
      focus: Math.min(FOCUS_MAX, pilotRules(state).startingFocus),
      statuses: [],
      draw: rest,
      hand: innate,
      discard: [],
      exhaust: [],
      enemies,
      cardsPlayedThisTurn: 0,
      blockGainedThisTurn: 0,
      stanceChangesThisTurn: 0,
      attacksThisTurn: 0,
      envMemory: {},
      energyPenaltyNextTurn: 0,
      skipNextTurn: false,
      pendingEnemies: [],
      actingUid: null,
      outcome: 'ongoing',
    },
  }));

  let announced = appendLog(seated, {
    source: 'system',
    kind: 'combat',
    text: `Contact: ${enemies.map((enemy) => enemyTable.get(enemy.defId).name).join(', ')}.`,
    detail: { encounterId, environmentId },
  });

  const environment = environmentTable.find(environmentId);
  if (environment !== undefined && environment.id !== CLEAR_SPACE_ID) {
    announced = appendLog(announced, {
      source: environmentId,
      kind: 'combat',
      text: `${environment.name}. ${environment.text}`,
      detail: { environmentId },
    });
  }

  announced = applyWavefrontHazard(announced);

  return startPlayerTurn(fireHook(announced, 'onCombatStart', { encounterId, environmentId }));
}

/**
 * The collapse front caught you before this fight. You start hot, and whatever
 * is in front of you is riding the same shock you are.
 *
 * It never blocks a route and it never kills you on arrival — it makes the
 * fight start worse, which is the only shape of pursuit that stays a problem to
 * solve rather than a verdict.
 */
function applyWavefrontHazard(state: GameState): GameState {
  const front = state.run?.wavefront ?? null;
  if (front === null || !front.hazardPending) return state;

  let next = withRun(state, (run) => ({
    ...run,
    wavefront: run.wavefront === null ? null : { ...run.wavefront, hazardPending: false },
  }));

  next = appendLog(next, {
    source: 'wavefront',
    kind: 'combat',
    text: 'The front is on top of you. The air is already burning.',
    detail: null,
  });

  next = gainHeat(next, WAVEFRONT.hazardHeat, 'wavefront');
  return withCombat(next, (combat) => ({
    ...combat,
    enemies: combat.enemies.map((enemy) => ({
      ...enemy,
      statuses: addStacks(enemy.statuses, STRENGTH, WAVEFRONT.hazardEnemyStrength),
    })),
  }));
}

/* ---------- the player's turn ---------- */

export function startPlayerTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  if (combat.outcome !== 'ongoing') return state;

  const stance = liveStance(state);
  const turn = combat.turn + 1;

  // Block is lost at the start of your turn, except what GUARD retains. Energy
  // is refilled, less anything a critical overheat took.
  //
  // A turn the reactor takes does not spend the penalty: an overheat at 10
  // costs a turn AND the Energy, and letting the skipped turn absorb the Energy
  // loss would quietly refund half the punishment for the worst overheat there
  // is.
  const relics = pilotRules(state);
  const skipping = combat.skipNextTurn;
  const energy = skipping
    ? 0
    : Math.max(0, PLAYER_BALANCE.energyPerTurn + relics.energyPerTurn - combat.energyPenaltyNextTurn);

  let next = withCombat(state, (current) => ({
    ...current,
    turn,
    round: current.round + 1,
    // Relic Block is granted on top of whatever the stance retained, so a
    // GUARD build and a Ballast Weave add up rather than one capping the other.
    block: Math.min(current.block, stance.blockRetained) + (skipping ? 0 : relics.blockPerTurn),
    focus: Math.min(FOCUS_MAX, current.focus + (skipping ? 0 : relics.focusPerTurn)),
    energy,
    energyPenaltyNextTurn: skipping ? current.energyPenaltyNextTurn : 0,
    cardsPlayedThisTurn: 0,
    blockGainedThisTurn: 0,
    attacksThisTurn: 0,
    stanceChangesThisTurn: 0,
    // You are acting, so nothing on you is new any more. Whatever the enemies
    // put on you last phase is live for this turn and decays at the end of it.
    statuses: clearFresh(current.statuses),
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

  if (!skipping && relics.ventPerTurn > 0) next = ventHeat(next, relics.ventPerTurn, 'relics');

  // Rust and Scald tick here: after the hand is dealt and the intents are
  // committed, so the player sees the damage and the Heat *before* deciding
  // what to spend the turn on. A clock you only find out about after acting is
  // not a clock, it is an ambush.
  next = tickStatuses(next, PLAYER);
  if (next.run?.combat?.outcome !== 'ongoing') return next;

  next = fireHook(next, 'onRoundStart', { round: requireCombat(next).round });
  next = fireHook(next, 'onTurnStart', { turn });

  /*
   * The reactor took this one — but you still take the turn.
   *
   * Energy is zero rather than the turn being skipped outright. The first
   * version jumped straight past: no draw, no hand, nothing to look at, and the
   * fight moved on while the player was still reading the last thing. Now you
   * draw, you see exactly the hand you cannot play, and you have to end the turn
   * holding it. Same cost, entirely legible — and a relic that hands the Energy
   * back is now a normal thing to write rather than a special case.
   *
   * Heat blows to zero with it. Otherwise an overheat walks straight into
   * another one with no playable turn in between, and a spiral you cannot act
   * on is a death sentence rather than a price.
   */
  if (combat.skipNextTurn) {
    next = withCombat(next, (current) => ({ ...current, skipNextTurn: false, heat: HEAT.min }));
    next = appendLog(next, {
      source: 'heat',
      kind: 'heat',
      text: 'The reactor is venting. No Energy this turn — end it and ride it out.',
      detail: { turn },
    });
  }

  return drawForTurn(next);
}

/**
 * Hand the round over to the enemies.
 *
 * Queued rather than resolved, so the UI can step through the enemy turn on a
 * timer instead of it arriving in a single frame. Shared by the normal end of
 * turn and by a turn the reactor took, which must reach the enemies by exactly
 * the same path or the two diverge the first time one of them changes.
 */
function queueEnemyTurn(state: GameState): GameState {
  // Chronal Shear queues them twice on its rounds. Building the queue is a
  // calculation, so it reads a rule rather than a hook — and doubling here
  // means the extra activation resolves the move that was already telegraphed,
  // never a fresh roll the player could not have seen.
  const shear = environmentRules(state).doubleActEvery ?? 0;
  const rounds = shear > 0 && requireCombat(state).round % shear === 0 ? 2 : 1;

  let next = state;
  if (rounds > 1) {
    next = appendLog(next, {
      source: requireCombat(next).environmentId,
      kind: 'combat',
      text: 'The shear folds. They move twice.',
      detail: { round: requireCombat(next).round },
    });
  }

  next = withCombat(next, (current) => {
    const queue = current.enemies
      .filter((enemy) => enemy.hp > 0 && enemy.intentMoveId !== null)
      .map((enemy) => enemy.uid);
    const repeated: string[] = [];
    for (let pass = 0; pass < rounds; pass++) repeated.push(...queue);
    return { ...current, pendingEnemies: repeated, actingUid: null };
  });

  // Nothing to wait for — no living enemy owes an action — so close the round
  // here rather than leaving the fight parked with an empty queue.
  if (requireCombat(next).pendingEnemies.length === 0) return closeRound(next);
  return next;
}

function drawForTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  // Deep Void's penalty is turn 1 only: it costs you the opening, not the fight.
  const penalty = combat.turn === 1 ? (environmentRules(state).firstTurnDrawPenalty ?? 0) : 0;
  const count = Math.max(
    0,
    PLAYER_BALANCE.drawPerTurn + liveStance(state).extraDraw + pilotRules(state).drawPerTurn - penalty,
  );
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

  /* Voided cards are the cost of an Anomaly that offered something for
     nothing. They cannot be played, which is the whole of their effect: they
     take up a card of every hand they turn up in until you pay to be rid of
     them. Refused here rather than by giving them an unpayable cost, so the
     reason on the card says what is actually true. */
  const def = definitionOf(card);
  if (def.type === 'voided') {
    return { ok: false, reason: 'Voided. It cannot be played — only removed.' };
  }

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

  next = checkOutcome(next);

  /*
   * A full gauge ends the turn where you stand.
   *
   * At the top of the bar there is nothing left to decide -- Heat cannot go
   * higher, so every further card is played into a foregone overheat. Ending it
   * here makes the ceiling mean something in the moment rather than at the end
   * of a turn you were already committed to, and the consequence is the ordinary
   * overheat, not a second worse one.
   */
  const hot = next.run?.combat;
  if (hot !== undefined && hot !== null && hot.outcome === 'ongoing' && hot.heat >= HEAT.max) {
    next = appendLog(next, {
      source: 'heat',
      kind: 'heat',
      text: `Heat ${hot.heat}/${HEAT.max}. The reactor decides the turn is over.`,
      detail: { heat: hot.heat },
    });
    return endPlayerTurn(next);
  }

  return next;
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
  if (combat.outcome !== 'ongoing' || combat.pendingEnemies.length > 0) return state;

  const stance = liveStance(state);
  let next = state;

  if (stance.heatAtTurnEnd > 0) next = gainHeat(next, stance.heatAtTurnEnd, stance.name);
  if (stance.ventAtTurnEnd > 0) next = ventHeat(next, stance.ventAtTurnEnd, stance.name);

  // Deep Void bleeds Heat on its own. Declared rather than hooked for the same
  // reason as the rest: it is a rule about the gauge, not a reaction to it.
  const decay = environmentRules(next).heatDecayPerTurn ?? 0;
  if (decay > 0) next = ventHeat(next, decay, environmentTable.get(combat.environmentId).name);

  next = fireHook(next, 'onTurnEnd', { turn: requireCombat(next).turn });
  next = resolveOverheat(next);

  next = checkOutcome(next);
  if (requireCombat(next).outcome !== 'ongoing') return next;

  next = withCombat(next, discardHand);
  return queueEnemyTurn(next);
}

/** Decay statuses, fire `onRoundEnd`, and open the next player turn. */
function closeRound(state: GameState): GameState {
  const next = withCombat(state, (current) => ({
    ...current,
    actingUid: null,
    statuses: decayStatuses(current.statuses),
    enemies: current.enemies.map((entry) => ({ ...entry, statuses: decayStatuses(entry.statuses) })),
  }));

  return startPlayerTurn(fireHook(next, 'onRoundEnd', { round: requireCombat(next).round }));
}

/** Is the enemy turn still owed? Drives the UI's playback timer. */
export function enemiesPending(state: GameState): boolean {
  const combat = state.run?.combat ?? null;
  return combat !== null && combat.outcome === 'ongoing' && combat.pendingEnemies.length > 0;
}

/**
 * Resolve exactly one enemy, then hand back. When the queue empties this also
 * closes the round and opens the next player turn.
 */
export function advanceEnemyTurn(state: GameState): GameState {
  const combat = requireCombat(state);
  if (combat.outcome !== 'ongoing') return state;

  const uid = combat.pendingEnemies[0];
  if (uid === undefined) return state;

  let next = withCombat(state, (current) => ({
    ...current,
    pendingEnemies: current.pendingEnemies.slice(1),
    actingUid: uid,
  }));

  const enemy = requireCombat(next).enemies.find((entry) => entry.uid === uid);
  const def = enemy === undefined ? undefined : enemyTable.get(enemy.defId);
  const move = def?.moves.find((entry) => entry.id === enemy?.intentMoveId);

  if (enemy !== undefined && def !== undefined && move !== undefined && enemy.hp > 0) {
    // Enemy Block, like the player's, is gone by the time it acts again. This
    // is also where the enemy's own statuses stop being new — it has now had a
    // turn under whatever the player put on it.
    next = withCombat(next, (current) => ({
      ...current,
      enemies: current.enemies.map((entry) =>
        entry.uid === uid ? { ...entry, block: 0, statuses: clearFresh(entry.statuses) } : entry,
      ),
    }));

    // Whatever is eating this enemy eats it before it swings, so a rust that
    // kills it means the move never lands.
    next = tickStatuses(next, enemyTarget(uid));
    if (next.run?.combat?.enemies.find((entry) => entry.uid === uid)?.hp === 0) return next;

    next = appendLog(next, {
      source: uid,
      kind: 'combat',
      text: `${def.name}: ${move.label}.`,
      detail: { enemy: def.id, move: move.id },
    });

    next = applyEffects(next, move.effects, createContext(uid, enemyTarget(uid), PLAYER)).state;

    // Spent — unless this enemy still owes another activation, which is what
    // Chronal Shear does. The second pass has to resolve the move that was
    // telegraphed, so the intent survives until the queue is done with it.
    // A cleared intent is also how the UI knows not to draw a stale one.
    if (!requireCombat(next).pendingEnemies.includes(uid)) {
      next = withCombat(next, (current) => ({
        ...current,
        enemies: current.enemies.map((entry) =>
          entry.uid === uid ? { ...entry, intentMoveId: null } : entry,
        ),
      }));
    }
  }

  next = checkOutcome(next);
  if (requireCombat(next).outcome !== 'ongoing') return next;
  if (requireCombat(next).pendingEnemies.length > 0) return next;

  return closeRound(next);
}

/** End the turn and run the whole enemy turn at once. Tests and the simulator. */
export function endTurnImmediately(state: GameState): GameState {
  let next = endPlayerTurn(state);
  let guard = 0;
  while (guard++ < 64 && enemiesPending(next)) next = advanceEnemyTurn(next);
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

/**
 * The stance strip's text, straight from the live table — Masteries folded in,
 * because a strip that describes the base stance after a Mastery rewrote it is
 * worse than no strip at all. The UI never writes its own.
 */
export function stanceText(state: GameState, stance: StanceId): string {
  return stanceRulesFor(state, stance).text;
}
