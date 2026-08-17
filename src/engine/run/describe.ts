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

import type { RunEffect } from '../types.ts';
import { cards as cardTable, modules as moduleTable, threads as threadTable } from '../../content/registry.ts';

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

    case 'hull':
      return effect.amount >= 0
        ? `Repair ${effect.amount} cutter hull`
        : `Lose ${-effect.amount} cutter hull`;

    case 'card': {
      const name = cardTable.find(effect.cardId)?.name ?? effect.cardId;
      return `Gain ${name}${effect.upgraded === true ? ' (forged)' : ''}`;
    }

    case 'module': {
      const name = moduleTable.find(effect.moduleId)?.name ?? effect.moduleId;
      return `Gain the ${name} module`;
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
