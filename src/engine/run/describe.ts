/* Generated text for run effects.
 *
 * Same rule as `describeCard()`: what an option says it does is derived from
 * what it actually does. Hand-written mechanical text drifts from behaviour the
 * moment a number is tuned, and drifted text is the most common cause of a game
 * feeling unfair — worse here than on a card, because an event choice is taken
 * once and cannot be re-read mid-fight.
 *
 * The hand-written parts of an event are its prose, its `detail` framing, and
 * its risk/payoff categories. Never its numbers.
 */

import type { ImplantDef, RelicPassive, RunEffect } from '../types.ts';
import { cards as cardTable, threads as threadTable } from '../../content/registry.ts';

export function describeRunEffect(effect: RunEffect): string {
  switch (effect.op) {
    case 'alloy':
      return effect.amount >= 0 ? `Gain ${effect.amount} Alloy` : `Pay ${-effect.amount} Alloy`;

    case 'health':
      return effect.amount >= 0 ? `Recover ${effect.amount} health` : `Lose ${-effect.amount} health`;

    case 'maxHealth':
      return effect.amount >= 0
        ? `Gain ${effect.amount} max health`
        : `Lose ${-effect.amount} max health`;

    case 'card': {
      const name = cardTable.find(effect.cardId)?.name ?? effect.cardId;
      return `Gain ${name}${effect.upgraded === true ? ' (forged)' : ''}`;
    }

    case 'upgradeRandomCard':
      return 'Forge a random card';

    case 'removeRandomCard':
      return 'Lose a random card';

    case 'setThread': {
      const def = threadTable.find(effect.threadId);
      return def === undefined ? 'Open a thread' : `Thread: ${def.name}`;
    }

    case 'resolveThread': {
      const def = threadTable.find(effect.threadId);
      return def === undefined ? 'Close a thread' : `${def.name} resolves`;
    }

    case 'ambush':
      return effect.tier === 'elite' ? 'A hard fight, now' : 'A fight, now';

    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

/** One line, in order. Empty when an option is pure narrative — "Leave". */
export function describeRunEffects(effects: readonly RunEffect[]): string {
  return effects.map(describeRunEffect).join(' · ');
}

/**
 * What an implant does, derived from its passive.
 *
 * Same rule as everywhere else: an implant is a permanent purchase that the
 * player is comparing against two other permanent purchases, so its line has to
 * be exactly what it will do. Hand-writing it means the day someone tunes
 * `damageFlat` from 2 to 3, the shop keeps promising 2.
 */
export function describePassive(passive: RelicPassive): string {
  const parts: string[] = [];
  const plus = (n: number): string => (n >= 0 ? `+${n}` : String(n));

  if (passive.energyPerTurn !== undefined && passive.energyPerTurn !== 0) {
    parts.push(`${plus(passive.energyPerTurn)} Energy each turn`);
  }
  if (passive.drawPerTurn !== undefined && passive.drawPerTurn !== 0) {
    const n = passive.drawPerTurn;
    parts.push(`Draw ${plus(n)} card${Math.abs(n) === 1 ? '' : 's'} each turn`);
  }
  if (passive.blockPerTurn !== undefined && passive.blockPerTurn !== 0) {
    parts.push(`Start each turn with ${passive.blockPerTurn} Block`);
  }
  if (passive.focusPerTurn !== undefined && passive.focusPerTurn !== 0) {
    parts.push(`Gain ${passive.focusPerTurn} Focus each turn`);
  }
  if (passive.ventPerTurn !== undefined && passive.ventPerTurn !== 0) {
    parts.push(`Vent ${passive.ventPerTurn} Heat each turn`);
  }
  if (passive.damageFlat !== undefined && passive.damageFlat !== 0) {
    parts.push(`Every attack deals ${passive.damageFlat} more`);
  }
  if (passive.damageTakenFlat !== undefined && passive.damageTakenFlat !== 0) {
    parts.push(`Every attack that reaches you deals ${passive.damageTakenFlat} less`);
  }
  if (passive.overheatThreshold !== undefined && passive.overheatThreshold !== 0) {
    parts.push(`The overheat threshold rises by ${passive.overheatThreshold}`);
  }
  if (passive.focusPerStackBonus !== undefined && passive.focusPerStackBonus !== 0) {
    parts.push(`Each stack of Focus is worth ${passive.focusPerStackBonus} more when spent`);
  }
  if (passive.startingFocus !== undefined && passive.startingFocus !== 0) {
    parts.push(`Start each fight with ${passive.startingFocus} Focus`);
  }
  if (passive.maxHealth !== undefined && passive.maxHealth !== 0) {
    parts.push(`${plus(passive.maxHealth)} max health`);
  }

  return parts.length === 0 ? 'Nothing, yet.' : `${parts.join('. ')}.`;
}

export function describeImplant(def: ImplantDef): string {
  return describePassive(def.passive);
}

/** `Honed Edge (2 of 3)` — what you already carry, for the shop shelf. */
export function implantStackLabel(def: ImplantDef, fitted: readonly string[]): string {
  const count = fitted.filter((id) => id === def.id).length;
  if (def.maxStacks === 1) return count > 0 ? 'Fitted' : '';
  return `${count} of ${def.maxStacks} fitted`;
}
