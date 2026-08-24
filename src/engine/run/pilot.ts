/* Handing the pilot a relic or an implant.
 *
 * Split out of `run.ts` because `effects.ts` needs it too — a `relic` run
 * effect grants one by name — and `run.ts` already imports `effects.ts`, so
 * leaving it there would have made a cycle between two modules that both run
 * work at import time. The split is the fix, not an import order that happens
 * to work today.
 */

import type { GameState } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { implants as implantTable, relics as relicTable } from '../../content/registry.ts';

/** Implants stack, so this only refuses one that does not exist. */
export function grantImplant(state: GameState, implantId: string | null): GameState {
  if (implantId === null) return state;
  if (implantTable.find(implantId) === undefined) return state;
  return withRun(state, (current) => ({
    ...current,
    pilot: { ...current.pilot, implants: [...current.pilot.implants, implantId] },
  }));
}

export function grantRelic(state: GameState, relicId: string | null): GameState {
  if (relicId === null) return state;
  const run = requireRun(state);
  if (run.pilot.relics.includes(relicId)) return state;
  const def = relicTable.find(relicId);
  if (def === undefined) return state;

  let next = withRun(state, (current) => ({
    ...current,
    pilot: { ...current.pilot, relics: [...current.pilot.relics, relicId] },
  }));

  // `maxHealth` is the one passive that is not read continuously — it is a
  // one-off change to the pilot, applied here and never again.
  const extra = def.passive?.maxHealth ?? 0;
  if (extra !== 0) {
    next = withRun(next, (current) => ({
      ...current,
      pilot: {
        ...current.pilot,
        maxHealth: Math.max(1, current.pilot.maxHealth + extra),
        health: Math.max(1, current.pilot.health + Math.max(0, extra)),
      },
    }));
  }

  return appendLog(next, {
    source: relicId,
    kind: 'reward',
    text: `${def.name}. ${def.text}`,
    detail: { relic: relicId },
  });
}
