/* The run-effect interpreter.
 *
 * `RunEffect` is to events and threads what `EffectOp` is to cards: the reason
 * an Anomaly is one entry in one data file rather than a function somewhere in
 * the engine. Adding an event must never mean touching this file.
 *
 * Two invariants that are not negotiable:
 *
 *   - An event never kills you. Health floors at 1. Dying to a menu is
 *     the single most resented thing a roguelike can do, and there is no fight
 *     to have played better.
 *   - Every effect leaves a line. The lines are what the outcome panel shows
 *     and what the log records — a state change with no line is
 *     indistinguishable from one that did not happen.
 */

import type { GameState, OutcomeLine, OutcomeRef, RunEffect } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { nextInt } from '../rng.ts';
import { mintCard } from '../combat/instances.ts';
import { gainAlloy, spendAlloy } from './economy.ts';
import { resolveThread, setThread } from './threads.ts';
import { grantRelic } from './pilot.ts';
import {
  cards as cardTable,
  relics as relicTable,
  threads as threadTable,
} from '../../content/registry.ts';

export interface RunEffectResult {
  readonly state: GameState;
  /** One line per effect that did something, in order. */
  readonly lines: readonly OutcomeLine[];
}

export function applyRunEffects(
  state: GameState,
  effects: readonly RunEffect[],
  source: string,
): RunEffectResult {
  let current = state;
  const lines: OutcomeLine[] = [];

  for (const effect of effects) {
    const applied = applyOne(current, effect, source);
    current = applied.state;
    if (applied.line !== null) {
      lines.push(
        applied.refs === undefined
          ? { text: applied.line }
          : { text: applied.line, refs: applied.refs },
      );
    }
  }

  return { state: current, lines };
}

interface Single {
  readonly state: GameState;
  readonly line: string | null;
  /**
   * What the line named, so the screen can let the player look at it.
   *
   * The reference travels with the line rather than being parsed back out of
   * it: the text is prose written for a person, and matching a card name
   * against it would be a parser that breaks the first time a card is called
   * something that appears inside another word.
   */
  readonly refs?: readonly OutcomeRef[];
}

function applyOne(state: GameState, effect: RunEffect, source: string): Single {
  const run = requireRun(state);

  switch (effect.op) {
    case 'alloy': {
      if (effect.amount === 0) return { state, line: null };
      if (effect.amount > 0) {
        return { state: gainAlloy(state, effect.amount, source), line: `Alloy +${effect.amount}.` };
      }
      // Clamped rather than refused: a bill you cannot pay takes what you have.
      const taken = Math.min(run.alloy, -effect.amount);
      if (taken === 0) return { state, line: 'They found nothing worth taking.' };
      return { state: spendAlloy(state, taken, source), line: `Alloy -${taken}.` };
    }

    case 'health': {
      if (effect.amount === 0) return { state, line: null };
      const health = Math.max(1, Math.min(run.pilot.maxHealth, run.pilot.health + effect.amount));
      const delta = health - run.pilot.health;
      if (delta === 0) return { state, line: null };
      return {
        state: logged(
          withRun(state, (current) => ({ ...current, pilot: { ...current.pilot, health } })),
          source,
          `Health ${delta > 0 ? '+' : ''}${delta} (${health}/${run.pilot.maxHealth}).`,
        ),
        line: `Health ${delta > 0 ? '+' : ''}${delta}.`,
      };
    }

    case 'maxHealth': {
      const maxHealth = Math.max(1, run.pilot.maxHealth + effect.amount);
      const health = Math.max(1, Math.min(maxHealth, run.pilot.health + Math.max(0, effect.amount)));
      return {
        state: logged(
          withRun(state, (current) => ({ ...current, pilot: { ...current.pilot, maxHealth, health } })),
          source,
          `Max health ${effect.amount > 0 ? '+' : ''}${effect.amount} (${maxHealth}).`,
        ),
        line: `Max health ${effect.amount > 0 ? '+' : ''}${effect.amount}.`,
      };
    }

    case 'card': {
      const def = cardTable.find(effect.cardId);
      if (def === undefined) return { state, line: null };
      const minted = mintCard(run.uidCounter, effect.cardId, effect.upgraded === true);
      return {
        state: logged(
          withRun(state, (current) => ({
            ...current,
            uidCounter: minted.uidCounter,
            pilot: { ...current.pilot, deck: [...current.pilot.deck, minted.value] },
          })),
          source,
          `Took ${def.name}.`,
        ),
        line: `${def.name} joins the deck.`,
        refs: [{ text: def.name, cardId: effect.cardId }],
      };
    }

    case 'upgradeRandomCard': {
      const candidates = run.pilot.deck.filter((card) => !card.upgraded);
      if (candidates.length === 0) return { state, line: 'Nothing left to upgrade.' };
      const rolled = nextInt(run.rng, 'events', 0, candidates.length);
      const chosen = candidates[rolled.value];
      if (chosen === undefined) return { state, line: null };
      const name = cardTable.find(chosen.defId)?.name ?? chosen.defId;
      return {
        state: logged(
          withRun(state, (current) => ({
            ...current,
            rng: rolled.rng,
            pilot: {
              ...current.pilot,
              deck: current.pilot.deck.map((card) =>
                card.uid === chosen.uid ? { ...card, upgraded: true } : card,
              ),
            },
          })),
          source,
          `Upgraded ${name}.`,
        ),
        /* Both faces, named. "Sever is upgraded" tells you a card you may
           never have read has become a card you have definitely never read —
           the whole event is the difference between the two, so the line names
           them both and each one opens. */
        line: `${name} is upgraded to ${name}+.`,
        refs: [
          { text: name, cardId: chosen.defId },
          { text: `${name}+`, cardId: chosen.defId, upgraded: true },
        ],
      };
    }

    case 'removeRandomCard': {
      if (run.pilot.deck.length <= 1) return { state, line: null };
      const rolled = nextInt(run.rng, 'events', 0, run.pilot.deck.length);
      const chosen = run.pilot.deck[rolled.value];
      if (chosen === undefined) return { state, line: null };
      const name = cardTable.find(chosen.defId)?.name ?? chosen.defId;
      return {
        state: logged(
          withRun(state, (current) => ({
            ...current,
            rng: rolled.rng,
            pilot: {
              ...current.pilot,
              deck: current.pilot.deck.filter((card) => card.uid !== chosen.uid),
            },
          })),
          source,
          `Lost ${name}.`,
        ),
        line: `${name} leaves the deck.`,
        refs: [{ text: name, cardId: chosen.defId }],
      };
    }

    case 'relic': {
      const next = grantRelic(state, effect.relicId);
      /* Already carried, or not a real id. Silent rather than a line saying
         nothing happened — the caller decides whether that is worth a word. */
      if (next === state) return { state, line: null };
      const def = relicTable.find(effect.relicId);
      return { state: next, line: def === undefined ? 'A relic.' : `${def.name}.` };
    }

    case 'setThread': {
      const next = setThread(state, effect.threadId);
      if (next === state) return { state, line: null };
      /* Names the Thread, now that the name opens onto something. It used to
         say only "a thread opens", which sent the player to the Manifest to
         find out which — a second screen for a fact this line already had. */
      const opened = threadTable.find(effect.threadId);
      return {
        state: next,
        line: opened === undefined ? 'A thread opens.' : `Thread: ${opened.name}.`,
        refs: opened === undefined ? [] : [{ text: opened.name, threadId: effect.threadId }],
      };
    }

    case 'resolveThread': {
      const next = resolveThread(state, effect.threadId);
      if (next === state) return { state, line: null };
      const closed = threadTable.find(effect.threadId);
      return {
        state: next,
        line: closed === undefined ? 'A thread closes.' : `${closed.name} closes.`,
        refs: closed === undefined ? [] : [{ text: closed.name, threadId: effect.threadId }],
      };
    }

    case 'ambush': {
      return {
        state: withRun(state, (current) => ({ ...current, forcedTier: effect.tier })),
        line: 'Something is already here.',
      };
    }

    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

function logged(state: GameState, source: string, text: string): GameState {
  return appendLog(state, { source, kind: 'run', text, detail: null });
}
