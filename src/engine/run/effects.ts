/* The run-effect interpreter.
 *
 * `RunEffect` is to events and threads what `EffectOp` is to cards: the reason
 * an Anomaly is one entry in one data file rather than a function somewhere in
 * the engine. Adding an event must never mean touching this file.
 *
 * Two invariants that are not negotiable:
 *
 *   - An event never kills you. Health and hull floor at 1. Dying to a menu is
 *     the single most resented thing a roguelike can do, and there is no fight
 *     to have played better.
 *   - Every effect leaves a line. The lines are what the outcome panel shows
 *     and what the log records — a state change with no line is
 *     indistinguishable from one that did not happen.
 */

import type { GameState, RunEffect } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { nextInt } from '../rng.ts';
import { mintCard } from '../combat/instances.ts';
import { gainAlloy, spendAlloy } from './economy.ts';
import { resolveThread, setThread } from './threads.ts';
import { SHIP, SHOP } from '../../content/balance.ts';
import { cards as cardTable, modules as moduleTable } from '../../content/registry.ts';

export interface RunEffectResult {
  readonly state: GameState;
  /** One line per effect that did something, in order. */
  readonly lines: readonly string[];
}

export function applyRunEffects(
  state: GameState,
  effects: readonly RunEffect[],
  source: string,
): RunEffectResult {
  let current = state;
  const lines: string[] = [];

  for (const effect of effects) {
    const applied = applyOne(current, effect, source);
    current = applied.state;
    if (applied.line !== null) lines.push(applied.line);
  }

  return { state: current, lines };
}

interface Single {
  readonly state: GameState;
  readonly line: string | null;
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

    case 'hull': {
      if (effect.amount === 0) return { state, line: null };
      const hull = Math.max(1, Math.min(run.ship.maxHull, run.ship.hull + effect.amount));
      const delta = hull - run.ship.hull;
      if (delta === 0) return { state, line: null };
      return {
        state: logged(
          withRun(state, (current) => ({ ...current, ship: { ...current.ship, hull } })),
          source,
          `Cutter hull ${delta > 0 ? '+' : ''}${delta} (${hull}/${run.ship.maxHull}).`,
        ),
        line: `Cutter hull ${delta > 0 ? '+' : ''}${delta}.`,
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
      };
    }

    case 'module': {
      const def = moduleTable.find(effect.moduleId);
      if (def === undefined) return { state, line: null };

      // The grid identifies a module by its id, so a second copy of one you
      // already own has nowhere to go. Pay it out instead of handing over a
      // duplicate that cannot be fitted — a dead option is worse than money.
      const owned =
        run.ship.stored.includes(effect.moduleId) ||
        run.ship.placed.some((entry) => entry.moduleId === effect.moduleId);
      if (owned) {
        const value = SHOP.modulePrice[def.rarity === 'basic' ? 'common' : def.rarity];
        return {
          state: gainAlloy(state, value, source),
          line: `You already run a ${def.name}. Sold on for ${value} Alloy.`,
        };
      }

      return {
        state: logged(
          withRun(state, (current) => ({
            ...current,
            ship: { ...current.ship, stored: [...current.ship.stored, effect.moduleId] },
          })),
          source,
          `${def.name} into storage.`,
        ),
        line: `${def.name} — fit it from the loadout.`,
      };
    }

    case 'upgradeRandomCard': {
      const candidates = run.pilot.deck.filter((card) => !card.upgraded);
      if (candidates.length === 0) return { state, line: 'Nothing left to forge.' };
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
          `Forged ${name}.`,
        ),
        line: `${name} is forged.`,
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
      };
    }

    case 'setThread': {
      const next = setThread(state, effect.threadId);
      if (next === state) return { state, line: null };
      return { state: next, line: 'A thread opens. Check the Manifest.' };
    }

    case 'resolveThread': {
      const next = resolveThread(state, effect.threadId);
      if (next === state) return { state, line: null };
      return { state: next, line: 'A thread closes.' };
    }

    case 'grid': {
      const gridW = Math.min(SHIP.targetEndGrid.w, run.ship.gridW + effect.w);
      const gridH = Math.min(SHIP.targetEndGrid.h, run.ship.gridH + effect.h);
      if (gridW === run.ship.gridW && gridH === run.ship.gridH) {
        return { state, line: 'The bay is already as big as the frame allows.' };
      }
      return {
        state: logged(
          withRun(state, (current) => ({ ...current, ship: { ...current.ship, gridW, gridH } })),
          source,
          `Bay extended to ${gridW}x${gridH}.`,
        ),
        line: `The bay is ${gridW}x${gridH} now.`,
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
