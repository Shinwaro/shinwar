/* Environments — the second layer of the map decision.
 *
 * Every combat node shows its environment badge before the player commits to
 * the route, so two players looking at the same fork should genuinely disagree
 * about which way to go. An Overheat deck loves Deep Void and fears Stellar
 * Corona; a Guard deck laughs at the Debris Field; a burst deck reads Gravity
 * Well as a gift and Chirality as a wall. That disagreement is the feature.
 *
 * Each environment is a definition plus, where it needs one, a set of hook
 * handlers. Nothing about an environment is special-cased in the engine.
 *
 * The split between `rules` and handlers is the thing to understand before
 * adding one:
 *
 *   - `rules` declares a modification to a calculation the engine is already
 *     performing — heat gain, the draw count, a damage multiplier. A hook
 *     cannot change a number a pipeline is about to produce, only react after
 *     it has, and a handler that "tops up" a result produces a number that is
 *     the sum of a recursion rather than a rule.
 *   - a handler does something *at a moment*: a rock at the end of a round, a
 *     radiation tick at the start of a turn.
 *
 * Design discipline worth preserving: even the Debris Field's randomness is
 * telegraphed a full turn ahead with a visible marker. It creates a problem to
 * solve, never a verdict.
 */

import type { EnvironmentDef, GameState } from '../engine/types.ts';
import { defineHook, registerHooks } from '../engine/hooks.ts';
import { withCombat } from '../engine/state.ts';
import { PLAYER, applyDirectDamage, enemyTarget, livingEnemies } from '../engine/combat/damage.ts';
import { addStacks, stacksOf } from '../engine/combat/keywords.ts';
import { envGetString, envSet } from '../engine/combat/rules.ts';
import { HOOK_PRIORITY } from './balance.ts';
import { IRRADIATE } from './statuses.ts';

export const CLEAR_SPACE_ID = 'clear_space';

export const STELLAR_CORONA_ID = 'stellar_corona';
export const DEEP_VOID_ID = 'deep_void';
export const GRAVITY_WELL_ID = 'gravity_well';
export const RADIATION_BELT_ID = 'radiation_belt';
export const DEBRIS_FIELD_ID = 'debris_field';
export const SENSOR_FOG_ID = 'sensor_fog';
export const CHRONAL_SHEAR_ID = 'chronal_shear';

/** Rock damage and radiation rate live here rather than inline in a handler. */
const DEBRIS_DAMAGE = 7;
const CHRONAL_EVERY = 3;

export const ENVIRONMENTS: readonly EnvironmentDef[] = [
  {
    id: CLEAR_SPACE_ID,
    name: 'Clear Space',
    text: 'No modifier.',
  },

  {
    id: STELLAR_CORONA_ID,
    name: 'Stellar Corona',
    text: 'All Heat gain +1. Venting is doubled.',
    rules: { heatGainBonus: 1, ventMultiplier: 2 },
  },

  {
    id: DEEP_VOID_ID,
    name: 'Deep Void',
    text: 'Heat falls 2 at the end of each turn. You draw 1 fewer on turn 1.',
    rules: { heatDecayPerTurn: 2, firstTurnDrawPenalty: 1 },
  },

  {
    id: GRAVITY_WELL_ID,
    name: 'Gravity Well',
    text: 'Attacks of 12 or more deal +50%. You may change stance only once a turn.',
    acts: [2, 3],
    rules: { bigHitThreshold: 12, bigHitMultiplier: 1.5, stanceChangesPerTurn: 1 },
  },

  {
    id: RADIATION_BELT_ID,
    name: 'Radiation Belt',
    text: 'Everyone gains 1 Irradiate each turn, and takes 1 damage per stack. Rewards fast kills.',
    acts: [2, 3],
  },

  {
    id: DEBRIS_FIELD_ID,
    name: 'Debris Field',
    text: `At the end of each round a rock hits the highest-HP combatant for ${DEBRIS_DAMAGE}. Marked a turn ahead.`,
  },

  {
    id: SENSOR_FOG_ID,
    name: 'Sensor Fog',
    text: 'Enemy intents are hidden. Scan is free, once a turn, and reveals one.',
    rules: { hideIntents: true, scansPerTurn: 1 },
  },

  {
    id: CHRONAL_SHEAR_ID,
    name: 'Chronal Shear',
    text: `Every ${CHRONAL_EVERY} rounds, enemies act twice.`,
    acts: [3],
    rules: { doubleActEvery: CHRONAL_EVERY },
  },
];

/* ---------- the reactive half ---------- */

/** Everyone still standing, player included, as damage targets. */
function combatants(state: GameState): readonly { target: ReturnType<typeof enemyTarget> | typeof PLAYER; hp: number; uid: string }[] {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return [];
  return [
    { target: PLAYER, hp: state.run?.pilot.health ?? 0, uid: 'player' },
    ...livingEnemies(combat).map((enemy) => ({
      target: enemyTarget(enemy.uid),
      hp: enemy.hp,
      uid: enemy.uid,
    })),
  ];
}

export function registerEnvironmentHooks(): void {
  /* ---- Radiation Belt ----
     Everyone cooks, including the enemies. A fight you end in three turns costs
     you three; a grind costs you the grind. */
  registerHooks(RADIATION_BELT_ID, [
    defineHook({
      hook: 'onTurnStart',
      priority: HOOK_PRIORITY.environment,
      handle: (state) => {
        let next = withCombat(state, (combat) => ({
          ...combat,
          statuses: addStacks(combat.statuses, IRRADIATE, 1),
          enemies: combat.enemies.map((enemy) =>
            enemy.hp > 0 ? { ...enemy, statuses: addStacks(enemy.statuses, IRRADIATE, 1) } : enemy,
          ),
        }));

        const combat = next.run?.combat;
        if (combat === undefined || combat === null) return next;

        const playerStacks = stacksOf(combat.statuses, IRRADIATE);
        if (playerStacks > 0) {
          next = applyDirectDamage(next, PLAYER, playerStacks, RADIATION_BELT_ID, 'radiation');
        }
        for (const enemy of livingEnemies(combat)) {
          const stacks = stacksOf(enemy.statuses, IRRADIATE);
          if (stacks > 0) {
            next = applyDirectDamage(next, enemyTarget(enemy.uid), stacks, RADIATION_BELT_ID, 'radiation');
          }
        }
        return next;
      },
    }),
  ]);

  /* ---- Debris Field ----
     Marked a full turn ahead. The randomness is in which rock comes, never in
     whether you could have seen it. */
  registerHooks(DEBRIS_FIELD_ID, [
    defineHook({
      hook: 'onTurnStart',
      priority: HOOK_PRIORITY.environment,
      handle: (state) => {
        const all = combatants(state);
        if (all.length === 0) return state;
        // Highest HP, ties broken by uid so the marker never depends on order.
        const marked = [...all].sort((a, b) => (b.hp - a.hp) || (a.uid < b.uid ? -1 : 1))[0];
        if (marked === undefined) return state;
        return envSet(state, 'debrisTarget', marked.uid);
      },
    }),
    defineHook({
      hook: 'onRoundEnd',
      priority: HOOK_PRIORITY.environment,
      handle: (state) => {
        const combat = state.run?.combat;
        if (combat === undefined || combat === null) return state;
        const uid = envGetString(combat, 'debrisTarget');
        if (uid === null) return state;

        const target = uid === 'player' ? PLAYER : enemyTarget(uid);
        if (uid !== 'player' && !combat.enemies.some((enemy) => enemy.uid === uid && enemy.hp > 0)) {
          return state;
        }
        return applyDirectDamage(state, target, DEBRIS_DAMAGE, DEBRIS_FIELD_ID, 'a rock');
      },
    }),
  ]);

  /* ---- Sensor Fog ----
     The scan budget is per turn, so it resets here rather than anywhere the
     engine has to know about. */
  registerHooks(SENSOR_FOG_ID, [
    defineHook({
      hook: 'onTurnStart',
      priority: HOOK_PRIORITY.environment,
      handle: (state) => envSet(envSet(state, 'revealed', []), 'scansUsed', 0),
    }),
  ]);

  /* Chronal Shear needs no handler: "enemies act twice" changes how the engine
     builds the enemy queue, which is a calculation, not a moment. It is a rule,
     and the doubling lands on what was already telegraphed rather than on a
     fresh roll — the whole point of the round counter being on screen. */
}
