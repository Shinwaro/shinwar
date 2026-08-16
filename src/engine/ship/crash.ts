/* Crashing.
 *
 * You cannot die in space. What a lost ship fight costs you is everything
 * except your life, and the bill arrives on the ground:
 *
 *   1. the drive is dead — no space node until it is paid for
 *   2. modules are shaken off the grid, chosen by where the hit landed
 *   3. the ronin arrives hurt, in the pool that CAN end the run
 *   4. every surface fight while stranded rolls from the elite band
 *
 * Each crash strips more than the last. The escalation lives in what you lose,
 * never in whether you survive. See SHIP.md.
 */

import type { GameState, ModuleId } from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { nextIntInclusive } from '../rng.ts';
import { CRASH } from '../../content/balance.ts';
import { modules as moduleTable } from '../../content/registry.ts';

/** Alloy to fly again. Rises with each crash, so a second one really bites. */
export function repairCost(crashesSoFar: number): number {
  return CRASH.repairBase + CRASH.repairIncrement * crashesSoFar;
}

export function isStranded(state: GameState): boolean {
  return state.run?.crash !== null && state.run?.crash !== undefined;
}

/**
 * Take the ship down.
 *
 * Modules are knocked loose from the bottom-right of the grid inward — the hit
 * came from somewhere, and "wherever you packed last" is a defensible and
 * legible rule that also makes placement a defensive decision rather than pure
 * packing.
 */
export function crashLand(state: GameState): GameState {
  const run = requireRun(state);
  const alreadyCrashed = run.crash === null ? 0 : 1;

  // How many modules the hit takes with it, worse each time.
  const losing = CRASH.modulesKnockedLoose + alreadyCrashed;
  const ordered = [...run.ship.placed].sort((a, b) => (a.y === b.y ? b.x - a.x : b.y - a.y));
  const knocked: ModuleId[] = ordered.slice(0, losing).map((entry) => entry.moduleId);

  const hurt = nextIntInclusive(run.rng, 'combat', CRASH.roninDamage.min, CRASH.roninDamage.max);
  const cost = repairCost(alreadyCrashed);

  let next = withRun(state, (current) => ({
    ...current,
    rng: hurt.rng,
    screen: 'map' as const,
    shipCombat: null,
    ship: {
      ...current.ship,
      hull: Math.max(1, Math.floor(current.ship.maxHull * CRASH.hullLeftPct)),
      placed: current.ship.placed.filter((entry) => !knocked.includes(entry.moduleId)),
      stored: [...current.ship.stored, ...knocked],
    },
    pilot: {
      ...current.pilot,
      // Never to zero: the crash cannot be what kills you, only what leaves you
      // somewhere that can.
      health: Math.max(1, current.pilot.health - hurt.value),
    },
    crash: { repairCost: cost, knockedLoose: knocked },
  }));

  next = appendLog(next, {
    source: 'system',
    kind: 'run',
    text: 'The cutter is falling. You ride it down.',
    detail: { crashed: true },
  });

  next = appendLog(next, {
    source: 'crash',
    kind: 'run',
    text:
      `Down hard. ${hurt.value} taken, drive dead, ` +
      `${knocked.length === 0 ? 'nothing shaken loose' : `${knocked.map((id) => moduleTable.get(id).name).join(' and ')} shaken loose`}. ` +
      `${cost} Alloy to fly again.`,
    detail: { damage: hurt.value, cost, knocked: knocked.length },
  });

  return appendLog(next, {
    source: 'crash',
    kind: 'run',
    text: 'Everything on this rock is bigger than it should be.',
    detail: null,
  });
}

/** Pay the bill. Available anywhere the ship can be worked on. */
export function repairDrive(state: GameState): GameState {
  const run = requireRun(state);
  const crash = run.crash;
  if (crash === null || run.alloy < crash.repairCost) return state;

  const next = withRun(state, (current) => ({
    ...current,
    alloy: current.alloy - crash.repairCost,
    ship: { ...current.ship, hull: Math.max(current.ship.hull, Math.floor(current.ship.maxHull * 0.5)) },
    crash: null,
  }));

  return appendLog(next, {
    source: 'crash',
    kind: 'run',
    text: `Drive repaired for ${crash.repairCost} Alloy. The sky is open again.`,
    detail: { cost: crash.repairCost },
  });
}
