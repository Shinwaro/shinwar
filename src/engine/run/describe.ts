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

import type { ImplantDef, MapNode, RelicPassive, RunEffect, RunSegment } from '../types.ts';
import {
  cards as cardTable,
  relics as relicTable,
  threads as threadTable,
} from '../../content/registry.ts';

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
      return `Gain ${name}${effect.upgraded === true ? ' (upgraded)' : ''}`;
    }

    case 'upgradeRandomCard':
      // "Forge" is the place; "upgrade" is what happens to the card. Saying
      // "forge a random card" made it sound like a card was being created.
      return 'Upgrade a random card';

    case 'removeRandomCard':
      return 'Lose a random card';

    case 'relic': {
      const def = relicTable.find(effect.relicId);
      return def === undefined ? 'Gain a relic' : `Gain ${def.name}`;
    }

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

/**
 * The same line, in pieces, so the UI can make the named things inspectable.
 *
 * A card or a Thread named in an Anomaly's text is a thing the player has
 * never seen and is being asked to decide about: "Gain Dead Reckoning" and
 * "Thread: Marked" are both the game naming something and then not showing it.
 * The name has to stay in the sentence — a separate list beside the option
 * would break the reading — so the sentence is returned in parts and the UI
 * makes those parts hoverable.
 *
 * Segmenting rather than returning ids and letting the UI rebuild the string:
 * the string is generated for the same reason card text is, and a second
 * assembler in the UI is a second thing to keep in step.
 */
function segmentsFor(effect: RunEffect): readonly RunSegment[] {
  if (effect.op === 'card') {
    const def = cardTable.find(effect.cardId);
    return [
      { kind: 'text', text: 'Gain ' },
      { kind: 'card', cardId: effect.cardId, text: def?.name ?? effect.cardId },
      ...(effect.upgraded === true
        ? [{ kind: 'text', text: ' (upgraded)' } as const]
        : []),
    ];
  }

  if (effect.op === 'setThread' || effect.op === 'resolveThread') {
    const def = threadTable.find(effect.threadId);
    if (def === undefined) return [{ kind: 'text', text: describeRunEffect(effect) }];
    return effect.op === 'setThread'
      ? [
          { kind: 'text', text: 'Thread: ' },
          { kind: 'thread', threadId: effect.threadId, text: def.name },
        ]
      : [
          { kind: 'thread', threadId: effect.threadId, text: def.name },
          { kind: 'text', text: ' resolves' },
        ];
  }

  return [{ kind: 'text', text: describeRunEffect(effect) }];
}

/** The whole line in pieces, with the same ` · ` joins as the flat version. */
export function describeRunEffectSegments(
  effects: readonly RunEffect[],
): readonly RunSegment[] {
  const out: RunSegment[] = [];
  effects.forEach((effect, index) => {
    if (index > 0) out.push({ kind: 'text', text: ' · ' });
    out.push(...segmentsFor(effect));
  });
  return out;
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
    /* "Start each turn with N" read as a floor you are set to. It is not — the
       turn loop adds it on top of whatever the stance retained — so the word is
       "gain". */
    parts.push(`Gain ${passive.blockPerTurn} Block at the start of each turn`);
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

/* ---------- arriving ----------
   What the place says about itself as you set down. Generated, like everything
   else the player reads: a node's arrival line is derived from what the node
   actually is, so it can never promise a fight that is not there. */

/**
 * The line under the place-name on the landing screen.
 *
 * Enemies are named where there are enemies, because "ambushed by two Scrap
 * Hounds" is information as well as atmosphere — it is the first look at the
 * fight, a beat before the fight. Where there is nothing, it says so plainly
 * rather than staying silent: a barren node used to be indistinguishable from a
 * misclick, and naming the emptiness is what turns it into a place you visited.
 */
export function describeLanding(node: MapNode, enemyNames: readonly string[]): string {
  const names = joinNames(enemyNames);

  switch (node.type) {
    case 'boss':
      return names === ''
        ? 'Whatever has been waiting at the end of this act is here.'
        : `${names} is already turned toward you. There is no route around this one.`;

    case 'elite':
      return names === ''
        ? 'Something well-armed has been expecting company.'
        : `${names} moves to meet you, unhurried. It has done this before.`;

    case 'combat':
      return names === ''
        ? 'Something moves against the light before you have finished setting down.'
        : `You are met by ${names}.`;

    case 'station':
      return 'A yard, still lit, still trading. Someone here will take your alloy.';

    case 'safe':
      return 'Nothing here wants anything from you. That is rarer than it sounds.';

    case 'event':
      /* A node that names its own Anomaly gets its own arrival. The generic
         line is written to undersell — "does not resolve into a shape yet" is
         right for a thing you rolled and wrong for the one fixed beat in the
         run, and reading the same non-committal sentence on the way into the
         Reliquary would flatten it into another Anomaly. */
      return node.eventId === null
        ? 'There is something down here that does not resolve into a shape yet.'
        : 'The hail is your own order’s, on a channel nobody has used in forty years. It is still repeating.';

    case 'unknown':
      return 'The scan comes back inconclusive. You go down anyway.';

    default: {
      const unreachable: never = node.type;
      return unreachable;
    }
  }
}

/** `a Scrap Hound`, `two Scrap Hounds`, `a Rust Tick and a Scrap Hound`. */
function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `a ${names[0] ?? ''}`;

  const all = names.every((name) => name === names[0]);
  if (all) {
    const counted = COUNT_WORDS[names.length] ?? String(names.length);
    return `${counted} ${names[0] ?? ''}s`;
  }

  const listed = names.map((name) => `a ${name}`);
  const last = listed.pop() ?? '';
  return `${listed.join(', ')} and ${last}`;
}

const COUNT_WORDS: Readonly<Record<number, string>> = { 2: 'two', 3: 'three', 4: 'four' };
