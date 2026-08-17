/* The enemy roster. Each enemy is a definition plus a small AI script, both
 * data — the script kinds live in `engine/combat/ai.ts` and nothing here is
 * a function.
 *
 * Intents commit at telegraph time and never re-roll; that is enforced in
 * `engine/combat/intents.ts`, not per-enemy.
 *
 * Three of Act 3's enemies need ongoing behaviour rather than a move, so they
 * subscribe to the hook bus below — an enemy id is a hook source exactly the
 * way a module or an environment is. Anything expressible as a `damageRules`
 * declaration is declared instead, because a hook cannot change a number the
 * damage pipeline is about to produce and the preview must never be able to
 * disagree with the result.
 */

import type { EnemyDef, GameState } from '../../engine/types.ts';
import { defineHook, registerHooks } from '../../engine/hooks.ts';
import { appendLog, withCombat } from '../../engine/state.ts';
import { addStacks } from '../../engine/combat/keywords.ts';
import { livingEnemies } from '../../engine/combat/damage.ts';
import { HOOK_PRIORITY } from '../balance.ts';
import { STRENGTH } from '../statuses.ts';
import { ACT1_ENEMIES } from './act1.ts';
import { ACT1_ELITES } from './act1elites.ts';
import { ACT2_ENEMIES } from './act2.ts';
import { ACT3_ENEMIES, HEAT_SIPHON, NULL_PRISM, TESSELLATE_SHARD } from './act3.ts';

export const ENEMIES: readonly EnemyDef[] = [
  ...ACT1_ENEMIES,
  ...ACT1_ELITES,
  ...ACT2_ENEMIES,
  ...ACT3_ENEMIES,
];

export function registerEnemyHooks(): void {
  /* ---- Heat Siphon ----
     Reads the gauge at the moment the player stops being able to change it.
     An Overheat deck can still run hot; it just has to arrive at the end of the
     turn cool, which is exactly the management the archetype was skipping. */
  registerHooks(HEAT_SIPHON, [
    defineHook({
      hook: 'onTurnEnd',
      priority: HOOK_PRIORITY.status,
      handle: (state: GameState) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null || combat.heat <= 0) return state;
        const stacks = combat.heat;
        const next = withCombat(state, (current) => ({
          ...current,
          enemies: current.enemies.map((enemy) =>
            enemy.defId === HEAT_SIPHON && enemy.hp > 0
              ? { ...enemy, statuses: addStacks(enemy.statuses, STRENGTH, stacks) }
              : enemy,
          ),
        }));
        return appendLog(next, {
          source: HEAT_SIPHON,
          kind: 'status',
          text: `Heat Siphon drinks ${stacks} Heat. Strength +${stacks}.`,
          detail: { stacks },
        });
      },
    }),
  ]);

  /* ---- Null Prism ----
     The first card each turn is burned after it resolves. It still does its
     job once — negating it outright would mean a turn the player could not
     plan — but a deck built around replaying one card loses that card. */
  registerHooks(NULL_PRISM, [
    defineHook({
      hook: 'onCardPlayed',
      priority: HOOK_PRIORITY.status,
      handle: (state: GameState, payload) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null) return state;
        if (combat.cardsPlayedThisTurn !== 1) return state;
        if (!livingEnemies(combat).some((enemy) => enemy.defId === NULL_PRISM)) return state;

        const card = combat.discard.find((entry) => entry.uid === payload.cardUid);
        if (card === undefined) return state;

        const next = withCombat(state, (current) => ({
          ...current,
          discard: current.discard.filter((entry) => entry.uid !== card.uid),
          exhaust: [...current.exhaust, card],
        }));
        return appendLog(next, {
          source: NULL_PRISM,
          kind: 'card',
          text: 'The Prism takes it. That card is gone for the fight.',
          detail: { card: payload.cardId },
        });
      },
    }),
  ]);

  /* ---- Tessellate Shard ----
     Shared plating: at the start of each round every living shard is brought up
     to the best plate among them. Burst one down and the others hand it back;
     hit all three and the sharing works against them. */
  registerHooks(TESSELLATE_SHARD, [
    defineHook({
      hook: 'onRoundStart',
      priority: HOOK_PRIORITY.environment,
      handle: (state: GameState) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null) return state;
        const shards = livingEnemies(combat).filter((enemy) => enemy.defId === TESSELLATE_SHARD);
        if (shards.length < 2) return state;

        const best = Math.max(...shards.map((enemy) => enemy.block));
        if (best === 0 || shards.every((enemy) => enemy.block === best)) return state;

        return withCombat(state, (current) => ({
          ...current,
          enemies: current.enemies.map((enemy) =>
            enemy.defId === TESSELLATE_SHARD && enemy.hp > 0 ? { ...enemy, block: best } : enemy,
          ),
        }));
      },
    }),
  ]);
}
