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
import { STANCES, STANCE_BY_ACT, type StanceRules } from '../../content/balance.ts';
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
  const base = STANCES[stance];

  /* The act's figures, before any mastery.
   *
   * Applied to the BASE table rather than after the overrides, so a mastery
   * that names its own number still wins — Still Water retains no Block in
   * Act 3 exactly as it does in Act 1. Falls back to the printed values for a
   * state with no run, which is how the info panel reads the table. */
  const scale = STANCE_BY_ACT[state.run?.act ?? 1];

  let rules: LiveStanceRules = {
    ...base,
    ...(scale === undefined
      ? {}
      : {
          blockRetained: base.blockRetained > 0 ? scale.blockRetained : 0,
          ...(base.hotDamage === undefined ? {} : { hotDamage: scale.hotDamage }),
        }),
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

  /* The two act-scaled figures, filled into whichever text survived the
     overrides. Last, so it reads the final numbers rather than the printed
     ones — a mastery that changes `blockRetained` and keeps the base wording
     still describes itself correctly. */
  return { ...rules, text: fillStanceText(rules) };
}

/** Substitutes `{block}` and `{hot}` in a stance line. See `StanceRules.text`. */
function fillStanceText(rules: LiveStanceRules): string {
  return rules.text
    .replace('{block}', String(rules.blockRetained))
    .replace('{hot}', String(rules.hotDamage ?? 0));
}

/**
 * May the player enter this stance right now?
 *
 * Separate from `canChangeStance`, which asks whether any change is left. This
 * asks about a specific destination, which is the only way to express Iron
 * Tide's and Banked Fire's cost: the limit belongs to the stance being entered,
 * not to the one being stood in. See `StanceRules.noReentry`.
 */
export function canEnterStance(state: GameState, to: StanceId): boolean {
  if (stanceRulesFor(state, to).noReentry !== true) return true;
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return true;
  return !combat.stancesLeftThisTurn.includes(to);
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
  readonly drawFirstTurn: number;
  readonly blockPerTurn: number;
  readonly focusPerTurn: number;
  readonly ventPerTurn: number;
  readonly healPerTurn: number;
  readonly healPerKill: number;
  readonly damageFlat: number;
  /** The same, but on every swing rather than the card's first. */
  readonly damageEveryHit: number;
  readonly damageTakenFlat: number;
  readonly overheatThreshold: number;
  readonly focusPerStackBonus: number;
  readonly startingFocus: number;
}

const NO_PILOT_RULES: PilotRules = {
  energyPerTurn: 0,
  drawPerTurn: 0,
  drawFirstTurn: 0,
  blockPerTurn: 0,
  focusPerTurn: 0,
  ventPerTurn: 0,
  healPerTurn: 0,
  healPerKill: 0,
  damageFlat: 0,
  damageEveryHit: 0,
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
      drawFirstTurn: rules.drawFirstTurn + (passive.drawFirstTurn ?? 0),
      blockPerTurn: rules.blockPerTurn + (passive.blockPerTurn ?? 0),
      focusPerTurn: rules.focusPerTurn + (passive.focusPerTurn ?? 0),
      ventPerTurn: rules.ventPerTurn + (passive.ventPerTurn ?? 0),
      healPerTurn: rules.healPerTurn + (passive.healPerTurn ?? 0),
      healPerKill: rules.healPerKill + (passive.healPerKill ?? 0),
      damageFlat: rules.damageFlat + (passive.damageFlat ?? 0),
      damageEveryHit: rules.damageEveryHit + (passive.damageEveryHit ?? 0),
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

/**
 * Chronal Shear's cadence, as a countdown.
 *
 * `null` when the environment does not fold at all. `0` means THIS round — the
 * enemies queued for the end of this turn will act twice.
 *
 * The environment's badge said "Every 3 rounds, enemies act twice" and left the
 * player to keep the count themselves, against a round number that is not on
 * screen. A rule you have to do arithmetic to apply is a rule you get wrong
 * once and then stop trusting; the Debris Field marks its target a full turn
 * ahead for exactly the same reason.
 *
 * Read off the same expression `queueEnemyTurn` uses, so the badge and the
 * queue cannot disagree about which round is the doubled one.
 */
export function shearCountdown(state: GameState): number | null {
  const every = environmentRules(state).doubleActEvery ?? 0;
  if (every <= 0) return null;
  const combat = state.run?.combat;
  if (combat === undefined || combat === null) return null;
  const into = combat.round % every;
  return into === 0 ? 0 : every - into;
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
