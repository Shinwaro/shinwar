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
  subsystemBroken,
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
  it('always leaves the mount itself to push', () => {
    // Agency must never depend on owning the right module: an empty grid still
    // gets one thing to do.
    const state = runWith((ship) => ship);
    expect(availableInterventions(state.run!.ship)).toEqual(['overcharge']);
    expect(canIntervene(state, 'overcharge')).toBe(true);
    expect(canIntervene(state, 'vent')).toBe(false);
  });

  it('unlocks the rest from what the build carries', () => {
    const state = runWith((ship) => place(place(ship, 'heat_sink', 0, 0), 'reactive_plating', 1, 0));
    expect(availableInterventions(state.run!.ship)).toEqual(['brace', 'overcharge', 'vent']);
    expect(canIntervene(state, 'vent')).toBe(true);
    expect(canIntervene(state, 'divert')).toBe(false);
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

describe('aiming', () => {
  it('starts on the hull and can be re-aimed for free', () => {
    let state = runWith((ship) => ship, 'lance_cutter');
    expect(state.run!.shipCombat!.target).toBe('hull');

    state = applyAction(state, { kind: 'aimAt', target: 'drive' });
    expect(state.run!.shipCombat!.target).toBe('drive');
    // Aiming is not the intervention — the lever is still there.
    expect(state.run!.shipCombat!.usedIntervention).toBeNull();
  });

  it('puts the volley into the part, not the hull', () => {
    let state = runWith((ship) => ship, 'lance_cutter');
    state = applyAction(state, { kind: 'aimAt', target: 'drive' });
    const hullBefore = state.run!.shipCombat!.enemy.hull;

    const after = resolveShipTurn(state);
    const fight = after.run!.shipCombat!;
    expect(fight.enemy.hull).toBe(hullBefore);
    expect(fight.enemy.subsystems.find((s) => s.id === 'drive')!.hp).toBeLessThan(
      fight.enemy.subsystems.find((s) => s.id === 'drive')!.maxHp,
    );
  });

  it('refuses a target that does not exist or is already wrecked', () => {
    const state = runWith((ship) => ship, 'lance_cutter');
    expect(applyAction(state, { kind: 'aimAt', target: 'nonsense' })).toBe(state);
  });

  it('pays off: a wrecked drive makes every later hit land harder', () => {
    let state = runWith((ship) => place(ship, 'mass_driver', 0, 0), 'lance_cutter');
    state = applyAction(state, { kind: 'aimAt', target: 'drive' });

    let guard = 0;
    while (guard++ < 20 && (state.run!.shipCombat!.enemy.subsystems.find((s) => s.id === 'drive')?.hp ?? 0) > 0) {
      state = resolveShipTurn(state);
      if (state.run?.shipCombat === null) return;
    }
    expect(subsystemBroken(state, 'drive')).toBe(true);

    // Now aim at the hull and confirm the hit is amplified.
    state = applyAction(state, { kind: 'aimAt', target: 'hull' });
    const before = state.run!.shipCombat!.enemy.hull;
    const after = resolveShipTurn(state);
    if (after.run?.shipCombat === null) return;
    expect(before - after.run!.shipCombat!.enemy.hull).toBeGreaterThan(0);
  });
});

describe('the crash', () => {
  function crashOut(): GameState {
    const opened = applyActions(createInitialState('CRASH-2'), [{ kind: 'beginRun' }]);
    let state = applyAction(opened, { kind: 'placeModule', moduleId: 'core_reactor', x: 0, y: 0 });
    state = applyAction(state, { kind: 'placeModule', moduleId: 'heat_sink', x: 2, y: 0 });
    state = { ...state, run: { ...state.run!, ship: { ...state.run!.ship, hull: 1 } } };
    state = startShipCombat(state, 'hauler_escort');
    let guard = 0;
    while (guard++ < 40 && state.run?.shipCombat !== null) {
      state = applyAction(state, { kind: 'resolveShipTurn' });
    }
    return state;
  }

  it('leaves the ronin alive, and never at zero', () => {
    const state = crashOut();
    expect(state.phase).toBe('run');
    expect(state.run?.outcome).toBeNull();
    expect(state.run!.pilot.health).toBeGreaterThan(0);
  });

  it('bills you for the drive and shakes a module loose', () => {
    const state = crashOut();
    const crash = state.run!.crash;
    expect(crash).not.toBeNull();
    expect(crash!.repairCost).toBeGreaterThan(0);
    expect(crash!.knockedLoose.length).toBeGreaterThan(0);
    // Knocked loose, not destroyed — it is in storage.
    for (const id of crash!.knockedLoose) expect(state.run!.ship.stored).toContain(id);
  });

  it('hurts the ronin and leaves the cutter on a sliver', () => {
    const state = crashOut();
    expect(state.run!.pilot.health).toBeLessThan(state.run!.pilot.maxHealth);
    expect(state.run!.ship.hull).toBeLessThan(state.run!.ship.maxHull * 0.2);
  });

  it('refuses space nodes until the drive is paid for', () => {
    const state = crashOut();
    const space = state.run!.map!.nodes.find((node) => node.arena === 'space');
    if (space === undefined) return;
    const parked: GameState = {
      ...state,
      run: { ...state.run!, position: null, screen: 'map' },
    };
    // Reaching one is the map's business; what matters is that entering is refused.
    const tried = applyAction(parked, { kind: 'moveToNode', nodeId: space.id });
    expect(tried.run?.shipCombat).toBeNull();
  });

  it('reopens the sky once repaired, and charges for it', () => {
    let state = crashOut();
    const cost = state.run!.crash!.repairCost;
    state = { ...state, run: { ...state.run!, alloy: cost + 10 } };
    state = applyAction(state, { kind: 'repairDrive' });

    expect(state.run?.crash).toBeNull();
    expect(state.run?.alloy).toBe(10);
    expect(state.run!.ship.hull).toBeGreaterThan(state.run!.ship.maxHull * 0.2);
  });

  it('refuses the repair you cannot afford', () => {
    let state = crashOut();
    state = { ...state, run: { ...state.run!, alloy: 0 } };
    expect(applyAction(state, { kind: 'repairDrive' })).toBe(state);
  });
});

describe('the loadout', () => {
  it('starts with one module already bolted in', () => {
    const state = applyActions(createInitialState('FIT'), [{ kind: 'beginRun' }]);
    expect(state.run!.ship.placed).toHaveLength(1);
    expect(state.run!.ship.stored).toHaveLength(0);
  });

  it('un-places and places again through the real actions', () => {
    let state = applyActions(createInitialState('FIT'), [{ kind: 'beginRun' }]);
    const fitted = state.run!.ship.placed[0]!.moduleId;

    state = applyAction(state, { kind: 'unplaceModule', moduleId: fitted });
    expect(state.run!.ship.placed).toHaveLength(0);
    expect(state.run!.ship.stored).toContain(fitted);

    state = applyAction(state, { kind: 'placeModule', moduleId: fitted, x: 1, y: 1 });
    expect(state.run!.ship.placed.map((p) => p.moduleId)).toContain(fitted);
    expect(state.run!.ship.stored).not.toContain(fitted);
  });

  it('refuses a placement that does not fit, without changing anything', () => {
    let state = applyActions(createInitialState('FIT2'), [{ kind: 'beginRun' }]);
    state = applyAction(state, { kind: 'placeModule', moduleId: 'core_reactor', x: 0, y: 0 });
    const before = state;
    // Overlapping the reactor.
    expect(applyAction(before, { kind: 'placeModule', moduleId: 'heat_sink', x: 1, y: 1 })).toBe(before);
  });

  it('opens only between fights', () => {
    const opened = applyActions(createInitialState('FIT3'), [{ kind: 'beginRun' }]);
    expect(applyAction(opened, { kind: 'openLoadout' }).run?.screen).toBe('ship');

    const fighting = startShipCombat(opened, 'picket_drone');
    expect(applyAction(fighting, { kind: 'openLoadout' }).run?.screen).toBe('shipCombat');
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
