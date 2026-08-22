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
import { weightedPick } from '../rng.ts';

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
  };
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

  // Weighted. A move that has already run `maxRepeats` times in a row drops to
  // zero weight, so a run of identical turns cannot happen — the player always
  // gets a readable pattern rather than three Bites and a shrug.
  const entries = script.entries
    .map((entry) => ({
      value: entry.move,
      weight:
        ai.lastMoveId === entry.move && ai.repeats >= script.maxRepeats ? 0 : entry.weight,
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
