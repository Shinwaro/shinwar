/* The enemy roster. Each enemy is a definition plus a small AI script, both
 * data — the script kinds live in `engine/combat/ai.ts` and nothing here is
 * a function.
 *
 * Intents commit at telegraph time and never re-roll; that is enforced in
 * `engine/combat/intents.ts`, not per-enemy.
 */

import type { EnemyDef } from '../../engine/types.ts';
import { ACT1_ENEMIES } from './act1.ts';

export const ENEMIES: readonly EnemyDef[] = [...ACT1_ENEMIES];
