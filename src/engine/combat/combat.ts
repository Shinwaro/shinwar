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
import { atCriticalHeat, gainHeat, resolveOverheat, ventHeat } from './heat.ts';
import { addStacks, clearFresh, decayStatuses, statusEnergy, tickStatuses } from './keywords.ts';
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

  /* The introduction deals its deck in written order.
     It is a scripted lesson — "play the Block card, now play the one that
     builds Heat" — and a shuffle makes that a lottery. Every other fight in the
     game shuffles on the `combat` stream as normal; this is the one place the
     order is the content. */
  const shuffled = run.tutorial
    ? { value: run.pilot.deck, rng: run.rng }
    : shuffle(run.rng, 'combat', run.pilot.deck);

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
  /* Overclock is read here rather than in the status tick, because this is the
     expression that answers "how much Energy do you get this turn" — and the
     `skipping` branch then denies it for free. A turn the reactor took must not
     be quietly refunded by a buff. */
  const overclock = statusEnergy(combat.statuses);
  const energy = skipping
    ? 0
    : Math.max(
        0,
        PLAYER_BALANCE.energyPerTurn +
          relics.energyPerTurn +
          overclock -
          combat.energyPenaltyNextTurn,
      );

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

  /* A Scald can tick you straight into the ceiling before you have played
     anything, and the ceiling takes the turn whoever pushed it there.

     Checked HERE, after the reactor-vent branch above has had its chance to
     blow the gauge back to zero — a vent turn is already the punishment for
     the last overheat, and reading the Heat before it clears would charge for
     the same overheat twice. This reads the Heat the player will actually be
     holding when they act.

     The hand is dealt first either way: you see the turn you are losing,
     exactly as on a vent turn. */
  const drawn = drawForTurn(next);
  if (!atCriticalHeat(drawn)) return drawn;

  return endPlayerTurn(
    appendLog(drawn, {
      source: 'heat',
      kind: 'heat',
      text: `Heat ${requireCombat(drawn).heat}/${HEAT.max} before you moved. The reactor takes this one.`,
      detail: { heat: requireCombat(drawn).heat },
    }),
  );
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
  /* Deep Void takes a card on every other round rather than only the first.
     A one-off tax on the opening is a thing that happens to you; a rhythm is
     something you play under, and a short hand you can see coming is a turn
     worth setting up for. Counting from round 1, so the void is present on the
     turn the badge promised it. */
  const every = environmentRules(state).drawPenaltyEvery ?? 0;
  const penalty = every > 0 && (every === 1 || combat.round % every === 1) ? 1 : 0;

  /*
   * Innate cards are seated in hand before turn 1 draws, so they have to come
   * OUT of the draw, not on top of it — otherwise a deck holding one opens on
   * six cards instead of five and the keyword is quietly a bonus card.
   *
   * That matters most for the cards you did not choose: The Witness is a
   * Voided card whose whole cost is occupying a slot in every opening hand,
   * and it was occupying nothing.
   *
   * Turn 1 only, and only because that is the one turn the hand is not empty
   * when this runs — `endPlayerTurn` discards. Written as "what is already in
   * hand" rather than "count the innates" so it stays true if anything else
   * ever puts a card there first.
   */
  const seated = combat.turn === 1 ? combat.hand.length : 0;

  const count = Math.max(
    0,
    PLAYER_BALANCE.drawPerTurn +
      liveStance(state).extraDraw +
      pilotRules(state).drawPerTurn -
      penalty -
      seated,
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
   *
   * Shares `atCriticalHeat` with the turn-start check rather than reading
   * `HEAT.max` directly. The two lines are the same number today and two names
   * for one rule is how they stop being.
   */
  if (atCriticalHeat(next)) {
    next = appendLog(next, {
      source: 'heat',
      kind: 'heat',
      text: `Heat ${requireCombat(next).heat}/${HEAT.max}. The reactor decides the turn is over.`,
      detail: { heat: requireCombat(next).heat },
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

  /* The round is NOT closed here, even when this was the last enemy.
   *
   * `closeRound` starts your turn, and starting your turn drops Block to what
   * the stance retains. Doing that in the same step as the last enemy's blow
   * meant Block was already gone before the number for the hit it absorbed had
   * been drawn — the armour appeared to give up a beat before the blow landed,
   * every single turn.
   *
   * The UI's held-Block hack was papering over exactly this, and a display
   * that disagrees with the state is a bug waiting for its second reader. So
   * the step stops here and `closeRound` is its own action, dispatched once the
   * blow has actually been shown. `roundOwed` is how anything else knows.
   *
   * Nothing is derived from a new field: the round is owed exactly when nobody
   * is queued and somebody has just acted, which `actingUid` already says. */
  return next;
}

/**
 * Has every enemy acted, with the round still open?
 *
 * The gap between the last blow landing and your turn beginning. The UI holds
 * it open for as long as the hit needs to be seen; `endTurnImmediately` closes
 * it at once.
 */
export function roundOwed(state: GameState): boolean {
  const combat = state.run?.combat ?? null;
  return (
    combat !== null &&
    combat.outcome === 'ongoing' &&
    combat.pendingEnemies.length === 0 &&
    combat.actingUid !== null
  );
}

/** Close the round and start the player's turn. Dispatched when `roundOwed`. */
export function closeRoundNow(state: GameState): GameState {
  if (!roundOwed(state)) return state;
  return closeRound(state);
}

/** End the turn and run the whole enemy turn at once. Tests and the simulator. */
export function endTurnImmediately(state: GameState): GameState {
  let next = endPlayerTurn(state);
  let guard = 0;
  while (guard++ < 64 && enemiesPending(next)) next = advanceEnemyTurn(next);
  // Nobody is watching, so the pause the UI takes here is not wanted.
  return closeRoundNow(next);
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

/* `concludeCombat` lived here and was deleted.
 *
 * It was the M1 flow: a win ended the run, because there was no map to return
 * to yet. M2 replaced it with `settleCombat` in the reducer and left this one
 * exported and uncalled — and it was the only thing that fired `onCombatEnd`,
 * so the hook silently stopped happening and Ash Rosary never healed anybody.
 *
 * The lesson is the dead function, not the missing call. A second, plausible,
 * exported "end the combat" is where a reader stops looking, and nothing in the
 * type system or the tests objects to one that is never reached. If a flow is
 * replaced, the thing it replaced goes. */

/**
 * The stance strip's text, straight from the live table — Masteries folded in,
 * because a strip that describes the base stance after a Mastery rewrote it is
 * worse than no strip at all. The UI never writes its own.
 */
export function stanceText(state: GameState, stance: StanceId): string {
  return stanceRulesFor(state, stance).text;
}
