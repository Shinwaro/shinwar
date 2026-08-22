/* Telegraphing.
 *
 * Two separate guarantees, and it matters that they are separate:
 *
 *   1. The *move* is committed at telegraph time and does not re-roll after
 *      the player acts. A player who plans around a telegraphed 14 and takes
 *      21 will never trust the game again. `intentMoveId` is written once, at
 *      the start of the player's turn, and only the enemy's own turn clears it.
 *
 *   2. The *numbers* shown for that move are recomputed on every read, through
 *      the same damage pipeline that will resolve them. So if the player makes
 *      themselves Vulnerable after seeing the telegraph, the telegraph updates
 *      to the truth rather than quietly lying by 50%.
 *
 * Freezing the number instead of the choice would be the easy mistake, and it
 * is the one that produces "it said 14".
 */

import type { EnemyState, GameState, IntentHit } from '../types.ts';
import { requireCombat, requireRun, withRun } from '../state.ts';
import { enemies as enemyTable } from '../../content/registry.ts';
import { chooseMove } from './ai.ts';
import { PLAYER, computeDamage, enemyTarget, livingEnemies } from './damage.ts';
import { intentsHidden } from './rules.ts';

/** Commit a move for every living enemy. Runs once, at the start of the player's turn. */
export function telegraphAll(state: GameState): GameState {
  const combat = requireCombat(state);
  let rng = requireRun(state).rng;

  const enemies = combat.enemies.map((enemy) => {
    if (enemy.hp <= 0) return { ...enemy, intentMoveId: null };
    const def = enemyTable.get(enemy.defId);
    // Hull as a percentage, for the bosses whose second half is a different
    // fight. `maxHp` is the definition's, not the instance's, so an enemy
    // buffed above its printed maximum cannot sit permanently in phase one.
    const hpPct = def.maxHp <= 0 ? 100 : (enemy.hp / def.maxHp) * 100;
    const choice = chooseMove(def, enemy.ai, rng, hpPct);
    rng = choice.rng;
    return { ...enemy, intentMoveId: choice.move.id, ai: choice.ai };
  });

  return withRun(state, (run) => ({
    ...run,
    rng,
    combat: run.combat === null ? null : { ...run.combat, enemies },
  }));
}

/**
 * What this enemy is about to do, with exact numbers. Attack amounts run
 * through `computeDamage` with Block excluded, so the number shown is what
 * will land before the player's Block eats into it.
 */
export function intentOf(state: GameState, enemy: EnemyState): readonly IntentHit[] {
  if (enemy.hp <= 0 || enemy.intentMoveId === null) return [];
  const def = enemyTable.find(enemy.defId);
  const move = def?.moves.find((entry) => entry.id === enemy.intentMoveId);
  if (move === undefined) return [];

  return move.intent.map((template) => {
    if (template.kind !== 'attack') return template;
    const breakdown = computeDamage(state, {
      amount: template.amount,
      attacker: enemyTarget(enemy.uid),
      target: PLAYER,
      isAttack: true,
      attackOrdinal: 0,
      consumesFocus: false,
    });
    return { ...template, amount: breakdown.beforeBlock };
  });
}

/* ---------- Sensor Fog ---------- */

/**
 * Can the player read this enemy's telegraph?
 *
 * Under Sensor Fog, no — and there is no way to buy it back. A free reveal once
 * a turn turned the environment into a click you paid before getting the
 * information anyway, which is a chore rather than a condition. Fighting blind
 * is the whole point of the badge on the node.
 */
export function intentVisible(state: GameState): boolean {
  return !intentsHidden(state);
}

/** `3 x 5`, or `14`, or `Strength +2`. Exactly what the mockup in the prompt shows. */
export function describeIntent(hits: readonly IntentHit[]): string {
  if (hits.length === 0) return 'Waiting';
  return hits
    .map((hit) => {
      if (hit.kind === 'attack') {
        return hit.times > 1 ? `${hit.times} x ${hit.amount}` : String(hit.amount);
      }
      return hit.label;
    })
    .join(' · ');
}

/** Total damage inbound this turn, before Block. Drives the "you will take N" readout. */
export function incomingDamage(state: GameState): number {
  const combat = requireCombat(state);
  return livingEnemies(combat).reduce((total, enemy) => {
    return (
      total +
      intentOf(state, enemy)
        .filter((hit) => hit.kind === 'attack')
        .reduce((sum, hit) => sum + hit.amount * Math.max(1, hit.times), 0)
    );
  }, 0);
}
