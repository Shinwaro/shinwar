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
  RelicPassive,
  JsonValue,
  MasteryId,
  StanceId,
} from '../types.ts';
import { withCombat } from '../state.ts';
import { STANCES, type StanceRules } from '../../content/balance.ts';
import {
  environments as environmentTable,
  implants as implantTable,
  masteries as masteryTable,
  relics as relicTable,
} from '../../content/registry.ts';

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

  // Relics that sharpen Focus land on top of whatever the stance pays, so a
  // Mastery and a relic stack rather than one quietly overwriting the other.
  const bonus = pilotRules(state).focusPerStackBonus;
  if (bonus !== 0) rules = { ...rules, focusPerStack: rules.focusPerStack + bonus };

  return rules;
}

/** The stance in play right now, as this run plays it. */
export function liveStance(state: GameState): LiveStanceRules {
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return stanceRulesFor(state, 'guard');
  return stanceRulesFor(state, combat.stance);
}

/* ---------- relics ----------
   Aggregated once and read wherever the number is actually produced, for the
   same reason the environment's rules are declared rather than hooked: a hook
   fires after a calculation, and every one of these has to be inside it. */

export interface PilotRules {
  readonly energyPerTurn: number;
  readonly drawPerTurn: number;
  readonly blockPerTurn: number;
  readonly focusPerTurn: number;
  readonly ventPerTurn: number;
  readonly healPerTurn: number;
  readonly damageFlat: number;
  readonly damageTakenFlat: number;
  readonly overheatThreshold: number;
  readonly focusPerStackBonus: number;
  readonly startingFocus: number;
}

const NO_PILOT_RULES: PilotRules = {
  energyPerTurn: 0,
  drawPerTurn: 0,
  blockPerTurn: 0,
  focusPerTurn: 0,
  ventPerTurn: 0,
  healPerTurn: 0,
  damageFlat: 0,
  damageTakenFlat: 0,
  overheatThreshold: 0,
  focusPerStackBonus: 0,
  startingFocus: 0,
};

/**
 * Everything the carried relics add up to.
 *
 * Summed in registry order so two relics touching the same field always compose
 * the same way for a seed, rather than in the order they were picked up.
 */
export function pilotRules(state: GameState): PilotRules {
  const held = state.run?.pilot.relics ?? [];
  const fitted = state.run?.pilot.implants ?? [];
  if (held.length === 0 && fitted.length === 0) return NO_PILOT_RULES;

  /*
   * Relics and implants are the same shape and land in the same place. Implants
   * are counted with multiplicity — two Honed Edges really is +4 on every
   * attack, which is the whole reason they are a list and not a set — and both
   * are walked in registry order so two touching the same field always compose
   * the same way for a seed.
   */
  /* A passive can be gated on the hull, and the gate is checked HERE — the one
     place every consumer already reads. The preview, the damage pipeline, the
     turn loop and the totals panel all call `pilotRules`, so a threshold turns
     on for all of them in the same instant. Gating anywhere else would let the
     preview disagree with the result. */
  const fraction = (() => {
    const pilot = state.run?.pilot;
    if (pilot === undefined) return 1;
    return pilot.health / Math.max(1, pilot.maxHealth);
  })();
  const live = (passive: RelicPassive): boolean => {
    if (passive.whenHullBelowPct !== undefined && fraction >= passive.whenHullBelowPct / 100) {
      return false;
    }
    if (passive.whenHullAbovePct !== undefined && fraction <= passive.whenHullAbovePct / 100) {
      return false;
    }
    return true;
  };

  const passives: RelicPassive[] = [];
  for (const def of relicTable.all()) {
    if (held.includes(def.id) && def.passive !== undefined && live(def.passive)) {
      passives.push(def.passive);
    }
  }
  for (const def of implantTable.all()) {
    if (!live(def.passive)) continue;
    const count = fitted.filter((id) => id === def.id).length;
    for (let i = 0; i < Math.min(count, def.maxStacks); i++) passives.push(def.passive);
  }

  let rules = NO_PILOT_RULES;
  for (const passive of passives) {
    rules = {
      energyPerTurn: rules.energyPerTurn + (passive.energyPerTurn ?? 0),
      drawPerTurn: rules.drawPerTurn + (passive.drawPerTurn ?? 0),
      blockPerTurn: rules.blockPerTurn + (passive.blockPerTurn ?? 0),
      focusPerTurn: rules.focusPerTurn + (passive.focusPerTurn ?? 0),
      ventPerTurn: rules.ventPerTurn + (passive.ventPerTurn ?? 0),
      healPerTurn: rules.healPerTurn + (passive.healPerTurn ?? 0),
      damageFlat: rules.damageFlat + (passive.damageFlat ?? 0),
      damageTakenFlat: rules.damageTakenFlat + (passive.damageTakenFlat ?? 0),
      overheatThreshold: rules.overheatThreshold + (passive.overheatThreshold ?? 0),
      focusPerStackBonus: rules.focusPerStackBonus + (passive.focusPerStackBonus ?? 0),
      startingFocus: rules.startingFocus + (passive.startingFocus ?? 0),
    };
  }
  return rules;
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
  const every = environmentRules(state).hideIntentsEvery ?? 0;
  if (every <= 0) return false;
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return false;
  /* Counting from round 1, so the fog is present on the turn the badge
     promised it rather than arriving a turn late. `% every === 1` reads oddly
     for `every` of 1 -- which would never hide -- so that case is folded into
     the guard above by treating 1 as "every round". */
  return every === 1 || combat.round % every === 1;
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
