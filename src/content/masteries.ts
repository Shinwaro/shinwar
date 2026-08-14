/* Stance Masteries — rare, run-defining, earned only from Elites and bosses.
 *
 * Each one permanently alters a stance for the rest of the run, which makes
 * the player's entire existing deck read differently. That is the "one axis,
 * recontextualized" lever, so cap them at 2-3 per run.
 *
 * Arrives at M5.
 */

import type { MasteryDef } from '../engine/types.ts';

export const MASTERIES: readonly MasteryDef[] = [];
