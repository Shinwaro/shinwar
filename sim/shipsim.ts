/* The space battle, simulated through the real engine.
 *
 * Not a prototype any more: this drives `startShipCombat`, `markStrike` and
 * `resolveShipTurn` exactly as the game does, so what it reports is what the
 * player will meet. The bot is deliberately simple — pick the enemy module that
 * hurts most, strike it, spend the intervention if there is one, resolve — and
 * that is the point. If a dumb bot cannot win, the fight is too hard; if it
 * wins everywhere without striking, the decision is not one.
 *
 *   npm run shipsim
 *
 * The bands it is tuned against, and why:
 *
 *   turns      6-12. Under about five and the build never gets to express
 *              itself; over about fifteen and it is a grind you are watching.
 *   win rate   a real build should clear Act 1 comfortably, sweat in Act 2 and
 *              genuinely lose sometimes in Act 3. A bare grid should lose.
 *   strikes    2-5 a fight. More than that means there is always an obvious
 *              target and the decision has gone flat.
 */

import type { GameState, ShipState } from '../src/engine/types.ts';
import { createInitialState, createRunState } from '../src/engine/state.ts';
import { applyAction } from '../src/engine/reducer.ts';
import {
  availableInterventions,
  enemyShipState,
  markStrike,
  mostValuable,
  resolveShipTurn,
  startShipCombat,
} from '../src/engine/ship/combat.ts';
import { firstFit, place } from '../src/engine/ship/grid.ts';
import { loadContent } from '../src/content/index.ts';
import { shipEnemies } from '../src/content/registry.ts';

loadContent();

/*
 * Builds grow across the acts, because players do.
 *
 * The first version of this handed every act the same four modules, which made
 * Act 3 look unwinnable when the real difference was that a player arriving
 * there has salvaged half a dozen. The prefix taken from each list is the
 * build at that point in the run: three parts in Act 1, five in Act 2, seven by
 * Act 3, on a grid that has been extended twice.
 */
const BUILDS: Readonly<Record<string, readonly string[]>> = {
  heat: [
    'core_reactor',
    'pyrometric_lens',
    'kiln_coupler',
    'thermal_converter',
    'ranging_spine',
    'heat_sink',
    'whetstone_array',
  ],
  void: [
    'core_reactor',
    'gravity_manipulator',
    'singularity_core',
    'collapse_ring',
    'trickle_cell',
    'ranging_spine',
    'coolant_lattice',
  ],
  turtle: [
    'core_reactor',
    'reactive_plating',
    'ablative_wedge',
    'mirror_facet',
    'whetstone_array',
    'coolant_lattice',
    'heat_sink',
  ],
  swarm: [
    'core_reactor',
    'autoloader_rack',
    'whetstone_array',
    'ranging_spine',
    'mass_driver',
    'predictive_array',
    'heat_sink',
  ],
  // The control. A grid nobody built should lose from Act 2 onward.
  bare: ['core_reactor'],
};

/** How much of a build list is on the grid by each act. */
const MODULES_BY_ACT: Readonly<Record<1 | 2 | 3, number>> = { 1: 3, 2: 5, 3: 7 };

const WEAPON_FOR: Readonly<Record<string, string>> = {
  heat: 'plasma_cannon',
  void: 'plasma_cannon',
  turtle: 'rail_repeater',
  swarm: 'lance_battery',
  bare: 'rail_repeater',
};

/** A run with a built ship, parked on the ship-combat screen. */
function seat(seed: string, buildName: string, act: 1 | 2 | 3, enemyId: string): GameState {
  const grid = act === 1 ? { w: 5, h: 3 } : act === 2 ? { w: 6, h: 3 } : { w: 7, h: 4 };
  const run = createRunState(seed, 0);

  let ship: ShipState = { ...run.ship, placed: [], stored: [], gridW: grid.w, gridH: grid.h };
  for (const id of (BUILDS[buildName] ?? []).slice(0, MODULES_BY_ACT[act])) {
    const spot = firstFit(ship, id);
    if (spot === null) continue;
    ship = place(ship, id, spot.x, spot.y, spot.rot);
  }
  ship = { ...ship, weaponId: WEAPON_FOR[buildName] ?? 'rail_repeater' };

  const state: GameState = {
    ...createInitialState(seed),
    phase: 'run',
    run: { ...run, act, ship },
  };
  return startShipCombat(state, enemyId);
}

interface Result {
  readonly won: boolean;
  readonly turns: number;
  readonly hullPct: number;
  readonly strikes: number;
}

function fight(seed: string, buildName: string, act: 1 | 2 | 3, enemyId: string, useStrikes: boolean): Result {
  let state = seat(seed, buildName, act, enemyId);
  let turns = 0;
  let strikes = 0;

  while (turns < 60 && state.run?.shipCombat?.outcome === 'ongoing') {
    turns += 1;

    const live = state.run?.shipCombat;
    if (useStrikes && state.run !== null && live !== null && live !== undefined) {
      const target = mostValuable(enemyShipState(state), live.pools);
      const placed = live.enemy.grid.find((entry) => entry.moduleId === target);
      if (placed !== undefined) {
        const marked = markStrike(state, { x: placed.x, y: placed.y });
        if (marked !== state) {
          state = marked;
          strikes += 1;
        }
      }
    }

    // Spend the lever if the build granted one. A player would.
    const verbs = state.run === null ? [] : availableInterventions(state.run.ship);
    const verb = verbs[0];
    if (verb !== undefined) state = applyAction(state, { kind: 'intervene', verb });

    state = resolveShipTurn(state);
  }

  const fightState = state.run?.shipCombat;
  const ship = state.run?.ship;
  return {
    won: fightState?.outcome === 'won',
    turns,
    hullPct: ship === undefined ? 0 : (ship.hull / ship.maxHull) * 100,
    strikes,
  };
}

function report(label: string, useStrikes: boolean, runs: number): void {
  console.log(`\n${label}`);
  for (const act of [1, 2, 3] as const) {
    const roster = shipEnemies.all().filter((entry) => entry.act === act);
    for (const name of Object.keys(BUILDS)) {
      let wins = 0;
      let turns = 0;
      let hull = 0;
      let strikes = 0;
      let count = 0;

      for (const enemy of roster) {
        for (let i = 0; i < runs; i++) {
          const result = fight(`${label}-${name}-${enemy.id}-${i}`, name, act, enemy.id, useStrikes);
          if (result.won) wins += 1;
          turns += result.turns;
          hull += result.hullPct;
          strikes += result.strikes;
          count += 1;
        }
      }

      console.log(
        `  act${act} ${name.padEnd(7)}` +
          `win ${String(Math.round((wins / count) * 100)).padStart(3)}%  ` +
          `turns ${(turns / count).toFixed(1).padStart(5)}  ` +
          `hull ${String(Math.round(hull / count)).padStart(3)}%  ` +
          `strikes ${(strikes / count).toFixed(1)}`,
      );
    }
  }
}

const RUNS = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.slice(7) ?? 60);

console.log('shipsim — the real space battle, driven through the real engine');
console.log(`${RUNS} fights per build per enemy. Bands: 6-12 turns, 2-5 strikes.`);

report('WITH the strike (the shipped fight)', true, RUNS);
report('WITHOUT it (does the decision matter?)', false, RUNS);
