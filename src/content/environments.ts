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
import { withCombat, withRun } from '../engine/state.ts';
import { PLAYER, applyDirectDamage, enemyTarget, livingEnemies } from '../engine/combat/damage.ts';
import { addStacks, stacksOf } from '../engine/combat/keywords.ts';
import { envGetString, envSet } from '../engine/combat/rules.ts';
import { pick } from '../engine/rng.ts';
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
/* Sensor Fog's cadence. 2 is blind, clear, blind, clear -- the fog is on the
   turn you arrive, and every clear round is one you can plan the next blind one
   from. */
const FOG_EVERY = 2;
/* Deep Void's cadence. Short hand, full hand, short hand -- the short ones are
   what you plan for and the full ones are what you plan with. */
const VOID_EVERY = 2;

export const ENVIRONMENTS: readonly EnvironmentDef[] = [
  {
    id: CLEAR_SPACE_ID,
    name: 'Clear Space',
    text: 'No modifier.',
  },

  {
    id: STELLAR_CORONA_ID,
    name: 'Stellar Corona',
    text: 'All Heat gain +1.',
    /* The doubled vent came out. It was meant as compensation -- Heat arrives
       faster but leaves faster -- and in play it mostly cancelled itself: a
       deck with any vent at all barely noticed the corona, and a deck without
       one got the penalty and none of the relief. One clean rule reads better
       than two that argue. */
    rules: { heatGainBonus: 1 },
  },

  {
    id: DEEP_VOID_ID,
    name: 'Deep Void',
    text: `Heat falls 2 at the end of each turn. You draw 1 fewer every ${VOID_EVERY} rounds.`,
    rules: { heatDecayPerTurn: 2, drawPenaltyEvery: VOID_EVERY },
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
    text: 'Everyone gains 1 Irradiate each turn, and takes 1 damage per stack.',
    acts: [2, 3],
  },

  {
    id: DEBRIS_FIELD_ID,
    name: 'Debris Field',
    text: `At the end of each round a rock hits one combatant at random for ${DEBRIS_DAMAGE}. Marked a turn ahead. Block stops it.`,
  },

  {
    id: SENSOR_FOG_ID,
    name: 'Sensor Fog',
    text: `Enemy intents are hidden every ${FOG_EVERY} rounds, starting with the first.`,
    rules: { hideIntentsEvery: FOG_EVERY },
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

/**
 * Everyone still standing, player included, as damage targets.
 *
 * Deliberately carries no HP any more. It used to, so the Debris Field could
 * pick the highest — and a field that says "hp" next to a list of targets is an
 * invitation to write another rule that quietly means "the player".
 */
function combatants(
  state: GameState,
): readonly { target: ReturnType<typeof enemyTarget> | typeof PLAYER; uid: string }[] {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return [];
  return [
    { target: PLAYER, uid: 'player' },
    ...livingEnemies(combat).map((enemy) => ({ target: enemyTarget(enemy.uid), uid: enemy.uid })),
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
     whether you could have seen it.

     The target is drawn uniformly from everyone still standing. It used to be
     the highest-HP combatant, which sounds neutral and is not: the ronin has 70
     health and an Act 1 enemy has twenty-something, so "highest HP" resolved to
     the player almost every round. That is a flat tax wearing a hazard's coat,
     and it punished the player precisely for the thing that keeps them alive.

     Uniform is neutral by construction. It also means a fight with two enemies
     in it is a fight where the rock probably hits something else -- which is a
     fair break rather than a designed favour, and it falls out of the rule
     instead of being written into it. */
  registerHooks(DEBRIS_FIELD_ID, [
    defineHook({
      hook: 'onTurnStart',
      priority: HOOK_PRIORITY.environment,
      handle: (state) => {
        const all = combatants(state);
        if (all.length === 0) return state;
        const run = state.run;
        if (run === null) return state;

        // Sorted by uid before the draw so the candidate list never depends on
        // array order -- the same seed has to mark the same target every time.
        const ordered = [...all].sort((a, b) => (a.uid < b.uid ? -1 : 1));
        const rolled = pick(run.rng, 'combat', ordered);
        const spun = withRun(state, (current) => ({ ...current, rng: rolled.rng }));
        return envSet(spun, 'debrisTarget', rolled.value.uid);
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
        /* Blockable, unlike overheat or a burn. The rock is announced a full
           turn ahead, and a hit you are shown and cannot answer is a bill
           rather than a decision -- the telegraph is only worth reading if
           holding Block is a reply to it. */
        return applyDirectDamage(state, target, DEBRIS_DAMAGE, DEBRIS_FIELD_ID, 'a rock', {
          blockable: true,
        });
      },
    }),
  ]);

  /* Sensor Fog needs no handler. It used to hand the telegraph back for a free
     Scan once a turn, which made it a chore rather than a condition — you paid
     one click and got the information anyway. Blind is the environment. */

  /* Chronal Shear needs no handler: "enemies act twice" changes how the engine
     builds the enemy queue, which is a calculation, not a moment. It is a rule,
     and the doubling lands on what was already telegraphed rather than on a
     fresh roll — the whole point of the round counter being on screen. */
}
