/* Enemy move selection.
 *
 * Two script kinds, both data: a `sequence` that cycles, and a `weighted` roll
 * on the `combat` stream with a cap on consecutive repeats. Between them they
 * cover every Act 1 enemy without anyone writing a function, which is the
 * point — an enemy is one file edit, same as a card.
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

function chooseFromScript(
  def: EnemyDef,
  script: EnemyScript,
  ai: EnemyAiState,
  rng: RngState,
): MoveChoice {
  if (script.kind === 'sequence') {
    const index = script.moves.length === 0 ? 0 : ai.moveIndex % script.moves.length;
    const id = script.moves[index];
    const move = id === undefined ? undefined : moveById(def, id);
    if (move === undefined) throw new Error(`ai: '${def.id}' sequence names an unknown move`);
    return { move, ai: advance(ai, move, index + 1), rng };
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

export function chooseMove(def: EnemyDef, ai: EnemyAiState, rng: RngState): MoveChoice {
  if (def.moves.length === 0) throw new Error(`ai: '${def.id}' has no moves`);
  return chooseFromScript(def, def.script, ai, rng);
}
