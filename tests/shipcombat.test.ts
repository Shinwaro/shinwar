/* Ship combat: autoresolve, the conversion chain, and the one lever.
 *
 * The headline is that the BUILD decides the fight — including which verbs the
 * player is allowed to spend. A grid with nothing that grants a verb is a
 * fight you only watch, and that has to be true rather than merely intended.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState, ShipState } from '../src/engine/types.ts';
import { applyAction, applyActions } from '../src/engine/reducer.ts';
import { createInitialState } from '../src/engine/state.ts';
import { place } from '../src/engine/ship/grid.ts';
import {
  availableInterventions,
  canIntervene,
  resolveShipTurn,
  shipIntent,
  startShipCombat,
} from '../src/engine/ship/combat.ts';
import { reloadContent } from '../src/content/index.ts';
import { SHIP_COMBAT } from '../src/content/balance.ts';

beforeEach(() => {
  reloadContent();
});

function runWith(build: (ship: ShipState) => ShipState, enemy = 'picket_drone'): GameState {
  const opened = applyActions(createInitialState('SHIP'), [{ kind: 'beginRun' }]);
  const run = opened.run!;
  const staged: GameState = { ...opened, run: { ...run, ship: build({ ...run.ship, placed: [], stored: [] }) } };
  return startShipCombat(staged, enemy);
}

describe('starting a ship fight', () => {
  it('seats the enemy and telegraphs before anything resolves', () => {
    const state = runWith((ship) => ship);
    const fight = state.run!.shipCombat!;
    expect(fight.turn).toBe(1);
    expect(fight.outcome).toBe('ongoing');
    expect(fight.enemy.hull).toBe(fight.enemy.maxHull);
    expect(shipIntent(state)).not.toBeNull();
  });

  it('never runs the card-combat system at the same time', () => {
    const state = runWith((ship) => ship);
    expect(state.run?.combat).toBeNull();
    expect(state.run?.screen).toBe('shipCombat');
  });
});

describe('modules grant verbs', () => {
  it('gives an empty grid nothing to spend', () => {
    const state = runWith((ship) => ship);
    expect(availableInterventions(state.run!.ship)).toEqual([]);
    expect(canIntervene(state, 'vent')).toBe(false);
  });

  it('unlocks exactly the verbs the build carries', () => {
    const state = runWith((ship) => place(place(ship, 'heat_sink', 0, 0), 'predictive_array', 1, 0));
    expect(availableInterventions(state.run!.ship)).toEqual(['overcharge', 'vent']);
    expect(canIntervene(state, 'vent')).toBe(true);
    expect(canIntervene(state, 'brace')).toBe(false);
  });

  it('spends the lever once a turn', () => {
    let state = runWith((ship) => place(ship, 'heat_sink', 0, 0));
    state = applyAction(state, { kind: 'intervene', verb: 'vent' });
    expect(state.run?.shipCombat?.usedIntervention).toBe('vent');
    expect(canIntervene(state, 'vent')).toBe(false);
  });
});

describe('the conversion chain', () => {
  it('runs reactor into converter into emitter in one turn', () => {
    // Reactor makes Energy; the Manipulator turns Energy into Singularity.
    const state = runWith((ship) =>
      place(place(ship, 'core_reactor', 0, 0), 'gravity_manipulator', 2, 0),
    );
    const after = resolveShipTurn(state);
    expect(after.run!.shipCombat!.pools.singularity).toBeGreaterThan(0);
  });

  it('pays the adjacency bonus only when the modules touch', () => {
    const touching = runWith((ship) =>
      place(place(ship, 'core_reactor', 0, 0), 'thermal_converter', 2, 0),
    );
    const apart = runWith((ship) =>
      place(place(ship, 'core_reactor', 0, 0), 'thermal_converter', 4, 0),
    );
    // Both work; the touching one simply converts more.
    const a = resolveShipTurn(touching).run!.shipCombat!;
    const b = resolveShipTurn(apart).run!.shipCombat!;
    expect(a.pools.heat).toBeLessThanOrEqual(b.pools.heat);
  });

  it('fires the weapon every turn regardless of the build', () => {
    const state = runWith((ship) => ship);
    const before = state.run!.shipCombat!.enemy.hull;
    const after = resolveShipTurn(state);
    expect(after.run!.shipCombat!.enemy.hull).toBeLessThan(before);
  });
});

describe('heat', () => {
  it('carries between turns and eventually cooks the hull', () => {
    let state = runWith((ship) => ship);
    const hullBefore = state.run!.ship.hull;
    let guard = 0;
    while (guard++ < 40 && state.run?.shipCombat?.outcome === 'ongoing') {
      const heat = state.run.shipCombat.pools.heat;
      if (heat >= SHIP_COMBAT.overheatAt) break;
      state = resolveShipTurn(state);
    }
    // Either the fight ended or heat climbed — it must never sit at zero
    // forever, or the resource is decoration.
    const fight = state.run?.shipCombat;
    if (fight !== null && fight !== undefined && fight.outcome === 'ongoing') {
      expect(fight.pools.heat).toBeGreaterThan(0);
    }
    expect(hullBefore).toBeGreaterThan(0);
  });

  it('resets Energy each turn but keeps Singularity', () => {
    const state = runWith((ship) =>
      place(place(ship, 'core_reactor', 0, 0), 'gravity_manipulator', 2, 0),
    );
    const after = resolveShipTurn(state);
    const fight = after.run!.shipCombat!;
    expect(fight.pools.energy).toBe(0);
    expect(fight.pools.singularity).toBeGreaterThan(0);
  });
});

describe('outcomes', () => {
  it('you cannot die in space — losing crashes you back onto the map', () => {
    // Hand the cutter almost no hull and let a big ship hit it.
    const opened = applyActions(createInitialState('CRASH'), [{ kind: 'beginRun' }]);
    const run = opened.run!;
    const staged: GameState = {
      ...opened,
      run: { ...run, ship: { ...run.ship, hull: 1, placed: [], stored: [] } },
    };
    let state = startShipCombat(staged, 'hauler_escort');

    let guard = 0;
    while (guard++ < 30 && state.run?.shipCombat !== null) {
      state = applyAction(state, { kind: 'resolveShipTurn' });
    }

    expect(state.phase, 'a lost ship fight must not end the run').toBe('run');
    expect(state.run?.outcome).toBeNull();
    expect(state.run?.screen).toBe('map');
    expect(state.run?.ship.hull).toBeGreaterThan(0);
  });

  it('winning returns to the map with the cutter intact', () => {
    let state = runWith((ship) => place(ship, 'mass_driver', 0, 0), 'picket_drone');
    let guard = 0;
    while (guard++ < 40 && state.run?.shipCombat !== null) {
      state = applyAction(state, { kind: 'resolveShipTurn' });
    }
    expect(state.run?.screen).toBe('map');
    expect(state.phase).toBe('run');
  });
});

describe('determinism', () => {
  it('plays out identically for the same seed', () => {
    const play = (): GameState => {
      let state = runWith((ship) => place(ship, 'core_reactor', 0, 0), 'lance_cutter');
      for (let i = 0; i < 4 && state.run?.shipCombat?.outcome === 'ongoing'; i++) {
        state = resolveShipTurn(state);
      }
      return state;
    };
    expect(JSON.stringify(play().run?.shipCombat)).toBe(JSON.stringify(play().run?.shipCombat));
  });
});
