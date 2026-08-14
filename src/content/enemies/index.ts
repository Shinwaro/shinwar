/* The enemy roster. Each enemy is a definition plus a small AI script.
 * Intents are committed at telegraph time and never re-roll — that lives in
 * `engine/combat/intents.ts`, not here.
 *
 * Empty until M1, which brings 3 Act 1 enemies with real AI.
 */

import type { EnemyDef } from '../../engine/types.ts';

export const ENEMIES: readonly EnemyDef[] = [];
