/* What the rules of *this* fight are.
 *
 * Two tables sit above the fight and rewrite it: the environment, chosen by the
 * route, and the player's Stance Masteries, earned from Elites and bosses.
 * Everything that used to read `STANCES[...]` directly reads through here
 * instead, so a mastery does not need a single special case anywhere else — it
 * is a diff against the stance table and nothing more.
 *
 * The environment half is the declarative one: `EnvironmentRules` describes
 * modifications to calculations the engine is already performing. A hook cannot
 * change a number a pipeline is about to produce, only react after it has, so
 * anything of that shape is declared rather than hooked. What environments do
 * *at a moment* — a rock at the end of the round, a radiation tick — is still a
 * hook handler, in `content/environments.ts`.
 */

import type {
  CombatState,
  EnvironmentRules,
  GameState,
  JsonValue,
  MasteryId,
  StanceId,
} from '../types.ts';
import { withCombat } from '../state.ts';
import { STANCES, type StanceRules } from '../../content/balance.ts';
import { environments as environmentTable, masteries as masteryTable } from '../../content/registry.ts';

/* ---------- stance, as this run plays it ---------- */

export interface LiveStanceRules extends StanceRules {
  /** How many times the stance may change in one turn. `Infinity` normally. */
  readonly stanceChangesPerTurn: number;
  /** Which masteries are rewriting it, for the UI to name. */
  readonly masteries: readonly MasteryId[];
}

/**
 * The stance table with every earned Mastery folded in.
 *
 * Masteries apply in registry order, so two touching the same stance always
 * compose the same way for a seed rather than in the order they were earned.
 */
export function stanceRulesFor(state: GameState, stance: StanceId): LiveStanceRules {
  const earned = state.run?.pilot.masteries ?? [];
  let rules: LiveStanceRules = {
    ...STANCES[stance],
    stanceChangesPerTurn: Number.POSITIVE_INFINITY,
    masteries: [],
  };

  for (const def of masteryTable.all()) {
    if (def.stance !== stance || !earned.includes(def.id)) continue;
    const { stanceChangesPerTurn, ...table } = def.overrides;
    rules = {
      ...rules,
      ...table,
      stanceChangesPerTurn: stanceChangesPerTurn ?? rules.stanceChangesPerTurn,
      masteries: [...rules.masteries, def.id],
    };
  }

  return rules;
}

/** The stance in play right now, as this run plays it. */
export function liveStance(state: GameState): LiveStanceRules {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return stanceRulesFor(state, 'guard');
  return stanceRulesFor(state, combat.stance);
}

/* ---------- the environment ---------- */

const NO_RULES: EnvironmentRules = {};

export function environmentRules(state: GameState): EnvironmentRules {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return NO_RULES;
  return environmentTable.find(combat.environmentId)?.rules ?? NO_RULES;
}

/**
 * How many stance changes this turn allows — the tighter of the environment's
 * limit and the mastery's. Both exist to make the axis cost something, and if
 * they disagree the restriction wins.
 */
export function stanceChangeLimit(state: GameState): number {
  const fromEnvironment = environmentRules(state).stanceChangesPerTurn ?? Number.POSITIVE_INFINITY;
  return Math.min(fromEnvironment, liveStance(state).stanceChangesPerTurn);
}

export function intentsHidden(state: GameState): boolean {
  return environmentRules(state).hideIntents === true;
}

/* ---------- the environment's scratch space ----------
   One bag on `CombatState`, owned by environment handlers and by these four
   functions. A field per environment would be six dead fields in every fight
   that does not have that environment. */

export function envGetNumber(combat: CombatState, key: string, fallback: number): number {
  const value = combat.envMemory[key];
  return typeof value === 'number' ? value : fallback;
}

export function envGetString(combat: CombatState, key: string): string | null {
  const value = combat.envMemory[key];
  return typeof value === 'string' ? value : null;
}

export function envGetList(combat: CombatState, key: string): readonly string[] {
  const value = combat.envMemory[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function envSet(state: GameState, key: string, value: JsonValue): GameState {
  return withCombat(state, (combat) => ({
    ...combat,
    envMemory: { ...combat.envMemory, [key]: value },
  }));
}
