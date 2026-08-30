/* Enemy move selection.
 *
 * Three script kinds, all data: a `sequence` that cycles, a `weighted` roll on
 * the `combat` stream with a cap on consecutive repeats, and a `phased` pair of
 * sequences with a hull threshold between them. Between them they cover every
 * enemy in the game without anyone writing a function, which is the point — an
 * enemy is one file edit, same as a card.
 *
 * Selection happens once, at telegraph time, and the result is stored on the
 * enemy. Nothing here runs again after the player acts.
 */

import type { EnemyAiState, EnemyDef, EnemyMove, EnemyScript, RngState } from '../types.ts';
import { nextInt, weightedPick } from '../rng.ts';
import { AI } from '../../content/balance.ts';

export interface MoveChoice {
  readonly move: EnemyMove;
  readonly ai: EnemyAiState;
  readonly rng: RngState;
}

function moveById(def: EnemyDef, id: string): EnemyMove | undefined {
  return def.moves.find((move) => move.id === id);
}

function advance(ai: EnemyAiState, chosen: EnemyMove, moveIndex: number): EnemyAiState {
  return {
    moveIndex,
    lastMoveId: chosen.id,
    repeats: ai.lastMoveId === chosen.id ? ai.repeats + 1 : 1,
    // Most recent first, and hard-capped: this lives in `GameState` and in every
    // serialised replay, so it must not grow with the length of the fight.
    recent: [chosen.id, ...ai.recent].slice(0, AI.recency.length),
  };
}

/**
 * Where in its rotation an enemy starts this fight.
 *
 * Every `sequence` enemy used to open on move zero, always — so the second time
 * you met one, the entire fight was known before it began. Rolled per enemy
 * INSTANCE at mint time, on the `combat` stream, so two of the same thing on
 * one board are not in lockstep either.
 */
export function startingMoveIndex(def: EnemyDef, rng: RngState): { index: number; rng: RngState } {
  const script = def.script;
  const length = rotationLength(script);
  if (length <= 1) return { index: 0, rng };
  const rolled = nextInt(rng, 'combat', 0, length);
  return { index: rolled.value, rng: rolled.rng };
}

function rotationLength(script: EnemyDef['script']): number {
  return script.kind === 'sequence'
    ? script.moves.length
    : script.kind === 'phased'
      ? script.opening.length
      : 0;
}

/**
 * The first place in the rotation where this enemy actually swings.
 *
 * For `openOnAttack` encounters. Takes no RNG and returns no RNG, which is the
 * point — an encounter that pins its opening must not consume a roll, or every
 * downstream draw in the fight would shift depending on a flag in the
 * encounter table.
 *
 * Falls back to zero when nothing in the rotation attacks. A board of pure
 * support enemies opening "on an attack" is a content mistake rather than a
 * runtime one, and index zero is the honest answer to an impossible question.
 */
export function firstAttackingMoveIndex(def: EnemyDef): number {
  const script = def.script;
  const ids =
    script.kind === 'sequence'
      ? script.moves
      : script.kind === 'phased'
        ? script.opening
        : [];
  for (let index = 0; index < ids.length; index += 1) {
    const move = def.moves.find((entry) => entry.id === ids[index]);
    if (move?.intent.some((hit) => hit.kind === 'attack') === true) return index;
  }
  return 0;
}

/** How much a move's printed weight is worth, given how recently it ran. */
function recencyFactor(ai: EnemyAiState, moveId: string): number {
  const at = ai.recent.indexOf(moveId);
  return at === -1 ? 1 : (AI.recency[at] ?? 1);
}

/** One step through a list of move ids, wrapping at the end. */
function cycle(
  def: EnemyDef,
  moves: readonly string[],
  ai: EnemyAiState,
  rng: RngState,
  from: number,
): MoveChoice {
  const index = moves.length === 0 ? 0 : from % moves.length;
  const id = moves[index];
  const move = id === undefined ? undefined : moveById(def, id);
  if (move === undefined) throw new Error(`ai: '${def.id}' sequence names an unknown move`);
  return { move, ai: advance(ai, move, index + 1), rng };
}

function chooseFromScript(
  def: EnemyDef,
  script: EnemyScript,
  ai: EnemyAiState,
  rng: RngState,
  hpPct: number,
): MoveChoice {
  if (script.kind === 'sequence') return cycle(def, script.moves, ai, rng, ai.moveIndex);

  if (script.kind === 'phased') {
    /* Which half of the fight this is. `hpPct` is the hull AFTER everything the
       player did last turn, because the move is chosen at telegraph time — so
       the blow that takes the boss under the line is answered by the escalation
       on the very next telegraph, which is where a player looking for cause and
       effect will look for it. */
    const closing = hpPct <= script.threshold;
    const moves = closing ? script.closing : script.opening;

    /* Restart the list on the turn the phase flips. There is no "phase" field
       on the enemy to read — deliberately, since every field added to
       `EnemyAiState` is a field in `GameState` and in every serialised replay —
       so the flip is derived: if the last move played is not one of the moves
       this phase can play, this is the first turn of the phase. */
    const fresh = ai.lastMoveId === null || !moves.includes(ai.lastMoveId);
    return cycle(def, moves, ai, rng, fresh ? 0 : ai.moveIndex);
  }

  /* Weighted, and biased against whatever it has just been doing.
   *
   * Two rules, and they are different rules. `maxRepeats` is a hard cap: a move
   * that has run that many times in a row drops to zero and cannot come up at
   * all. Recency is a soft one on top — a move played last turn is worth a
   * fifth of its printed weight, the turn before that half — so the enemy
   * tends to move through its repertoire without ever being unable to repeat
   * something. See `AI.recency`. Flat weights with only the cap produced Bite,
   * Plate, Bite, Plate: a pattern the player could read that the designer never
   * wrote. */
  const entries = script.entries
    .map((entry) => ({
      value: entry.move,
      weight:
        ai.lastMoveId === entry.move && ai.repeats >= script.maxRepeats
          ? 0
          : entry.weight * recencyFactor(ai, entry.move),
    }))
    .filter((entry) => entry.weight > 0);

  const usable = entries.length > 0
    ? entries
    : script.entries.map((entry) => ({ value: entry.move, weight: entry.weight }));

  const rolled = weightedPick(rng, 'combat', usable);
  const move = moveById(def, rolled.value);
  if (move === undefined) throw new Error(`ai: '${def.id}' weighted table names an unknown move`);
  return { move, ai: advance(ai, move, ai.moveIndex + 1), rng: rolled.rng };
}

/**
 * `hpPct` is the enemy's current hull as a percentage of its maximum. Only
 * `phased` scripts read it; passing it always keeps the caller from having to
 * know which kind it is holding.
 */
export function chooseMove(
  def: EnemyDef,
  ai: EnemyAiState,
  rng: RngState,
  hpPct: number,
): MoveChoice {
  if (def.moves.length === 0) throw new Error(`ai: '${def.id}' has no moves`);
  return chooseFromScript(def, def.script, ai, rng, hpPct);
}
