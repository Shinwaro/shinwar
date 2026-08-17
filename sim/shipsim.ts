/* A prototype of the proposed space battle, run headless.
 *
 * This is NOT the shipped fight. It models the design Robin asked for — both
 * sides have a visible grid, the volley resolves automatically, and the one
 * decision a turn is whether to spend Energy striking a single enemy cell to
 * disable the module in it — so the numbers can be looked at before any of it
 * is built. Building first and measuring second is how a system ends up with
 * three turns of content and a lot of code around it.
 *
 * It uses the REAL module pool and the REAL stat aggregation, so what it says
 * about the four build chains is true of the game rather than of a sketch.
 *
 *   npm run shipsim
 *
 * Everything rolls on a seeded PRNG. Two runs of the same seed are identical.
 */

import type { RngState, ShipState } from '../src/engine/types.ts';
import { createRng, nextFloat } from '../src/engine/rng.ts';
import { shipStats, type Pools } from '../src/engine/ship/stats.ts';
import { firstFit, place } from '../src/engine/ship/grid.ts';
import { loadContent } from '../src/content/index.ts';
import { modules as moduleTable, weapons } from '../src/content/registry.ts';

loadContent();

/* ---------- the model ---------- */

interface Fighter {
  readonly name: string;
  ship: ShipState;
  hull: number;
  readonly maxHull: number;
  pools: Pools;
  /** Module ids knocked offline, and for how many more turns. */
  disabled: Map<string, number>;
  readonly weaponId: string;
}

/** A grid with these modules packed into it, first-fit. */
function build(name: string, moduleIds: readonly string[], w: number, h: number, hull: number, weaponId: string): Fighter {
  let ship: ShipState = {
    hull,
    maxHull: hull,
    gridW: w,
    gridH: h,
    placed: [],
    stored: [],
    weaponId,
  };
  for (const id of moduleIds) {
    const spot = firstFit(ship, id);
    if (spot === null) continue;
    ship = place(ship, id, spot.x, spot.y, spot.rot);
  }
  return {
    name,
    ship,
    hull,
    maxHull: hull,
    pools: { heat: 0, energy: 0, singularity: 0 },
    disabled: new Map(),
    weaponId,
  };
}

/** The grid minus whatever is currently offline. Disabling has to change the build. */
function liveShip(fighter: Fighter): ShipState {
  if (fighter.disabled.size === 0) return fighter.ship;
  return {
    ...fighter.ship,
    placed: fighter.ship.placed.filter((entry) => !fighter.disabled.has(entry.moduleId)),
  };
}

function tickPools(fighter: Fighter): void {
  // Producers and converters, roughly as the real resolver runs them.
  let { heat, energy, singularity } = fighter.pools;
  energy = 0;
  for (const placed of liveShip(fighter).placed) {
    for (const effect of moduleTable.get(placed.moduleId).effects) {
      if (effect.kind === 'produce') {
        if (effect.resource === 'heat') heat += effect.amount;
        if (effect.resource === 'energy') energy += effect.amount;
        if (effect.resource === 'singularity') singularity += effect.amount;
      }
      if (effect.kind === 'convert') {
        const from = effect.from === 'heat' ? heat : effect.from === 'energy' ? energy : singularity;
        const moved = Math.min(effect.cap, Math.floor(from / effect.rate));
        if (moved <= 0) continue;
        const spent = moved * effect.rate;
        if (effect.from === 'heat') heat -= spent;
        if (effect.from === 'energy') energy -= spent;
        if (effect.from === 'singularity') singularity -= spent;
        if (effect.to === 'heat') heat += moved;
        if (effect.to === 'energy') energy += moved;
        if (effect.to === 'singularity') singularity += moved;
      }
    }
  }
  fighter.pools = {
    heat: Math.max(0, Math.min(20, heat)),
    energy: Math.max(0, energy),
    singularity: Math.max(0, Math.min(20, singularity)),
  };
}

interface Config {
  /** Energy a 1x1 disabling strike costs. `null` removes the mechanic entirely. */
  readonly strikeCost: number | null;
  /** Turns a struck module stays offline. */
  readonly disableTurns: number;
  /** Does the enemy strike back at your grid? */
  readonly enemyStrikes: boolean;
}

/** One volley, hull only. Returns damage dealt. */
function volley(attacker: Fighter, defender: Fighter, rng: RngState): { damage: number; rng: RngState } {
  const stats = shipStats(liveShip(attacker), attacker.pools);
  const defence = shipStats(liveShip(defender), defender.pools);
  const weapon = weapons.get(attacker.weaponId);

  const shots = Math.max(1, weapon.shots + Math.round(stats.extraShots));
  const perShot = Math.max(0, weapon.damage + stats.flatDamage);

  const roll = nextFloat(rng, 'combat');
  const crit = stats.critChance > 0 && roll.value < Math.min(0.85, stats.critChance);
  const raw = Math.round(perShot * shots * (crit ? 1.5 + stats.critBonus : 1));

  // Parry, then flat reduction. Both are the defender's build talking.
  const parryRoll = nextFloat(roll.rng, 'combat');
  const parried = defence.parryChance > 0 && parryRoll.value < defence.parryChance;
  const after = parried ? 0 : Math.max(0, raw - Math.round(defence.damageReduction));

  attacker.pools = { ...attacker.pools, heat: Math.min(20, attacker.pools.heat + weapon.heat * shots) };
  defender.hull = Math.max(0, defender.hull - after);
  if (stats.lifesteal > 0) {
    attacker.hull = Math.min(attacker.maxHull, attacker.hull + Math.round(stats.lifesteal));
  }
  return { damage: after, rng: parryRoll.rng };
}

/**
 * Which enemy module is worth disabling?
 *
 * A stand-in for the player, and deliberately a simple one: take out whatever
 * contributes most to the stat that is hurting you. If a dumb heuristic cannot
 * find a meaningful target, the decision is not a decision.
 */
function bestTarget(defender: Fighter): string | null {
  const live = liveShip(defender);
  const withAll = shipStats(live, defender.pools);
  let best: string | null = null;
  let bestDrop = 0;

  for (const placed of live.placed) {
    const without: ShipState = {
      ...live,
      placed: live.placed.filter((entry) => entry.moduleId !== placed.moduleId),
    };
    const stats = shipStats(without, defender.pools);
    // Weighted by what actually hurts: damage out, then survivability.
    const drop =
      (withAll.flatDamage - stats.flatDamage) * 3 +
      (withAll.critChance - stats.critChance) * 40 +
      (withAll.damageReduction - stats.damageReduction) * 2 +
      (withAll.parryChance - stats.parryChance) * 30 +
      (withAll.extraShots - stats.extraShots) * 8 +
      (withAll.lifesteal - stats.lifesteal) * 2;
    if (drop > bestDrop) {
      bestDrop = drop;
      best = placed.moduleId;
    }
  }
  return best;
}

interface Result {
  readonly won: boolean;
  readonly turns: number;
  readonly hullLeft: number;
  readonly strikes: number;
}

function fight(player: Fighter, enemy: Fighter, config: Config, seed: string): Result {
  let rng = createRng(seed);
  let turns = 0;
  let strikes = 0;

  while (turns < 40 && player.hull > 0 && enemy.hull > 0) {
    turns += 1;

    for (const fighter of [player, enemy]) {
      for (const [id, left] of [...fighter.disabled]) {
        if (left <= 1) fighter.disabled.delete(id);
        else fighter.disabled.set(id, left - 1);
      }
      tickPools(fighter);
    }

    // The one decision a turn.
    if (config.strikeCost !== null && player.pools.energy >= config.strikeCost) {
      const target = bestTarget(enemy);
      if (target !== null) {
        enemy.disabled.set(target, config.disableTurns);
        player.pools = { ...player.pools, energy: player.pools.energy - config.strikeCost };
        strikes += 1;
      }
    }

    const hit = volley(player, enemy, rng);
    rng = hit.rng;
    if (enemy.hull <= 0) break;

    if (config.enemyStrikes && enemy.pools.energy >= 2) {
      const target = bestTarget(player);
      if (target !== null) player.disabled.set(target, config.disableTurns);
    }

    const back = volley(enemy, player, rng);
    rng = back.rng;
  }

  return { won: enemy.hull <= 0, turns, hullLeft: player.hull, strikes };
}

/* ---------- the builds ---------- */

const BUILDS: Readonly<Record<string, readonly string[]>> = {
  heat: ['core_reactor', 'pyrometric_lens', 'kiln_coupler', 'thermal_converter'],
  void: ['core_reactor', 'gravity_manipulator', 'singularity_core', 'collapse_ring'],
  turtle: ['core_reactor', 'reactive_plating', 'ablative_wedge', 'mirror_facet'],
  swarm: ['core_reactor', 'autoloader_rack', 'whetstone_array', 'ranging_spine'],
  bare: ['core_reactor'],
};

const WEAPON_FOR: Readonly<Record<string, string>> = {
  heat: 'plasma_cannon',
  void: 'plasma_cannon',
  turtle: 'rail_repeater',
  swarm: 'lance_battery',
  bare: 'rail_repeater',
};

/** An enemy with a grid of its own, sized to the act. */
function enemyFor(act: number): Fighter {
  const rosters: Readonly<Record<number, readonly string[]>> = {
    1: ['reactive_plating', 'ranging_spine'],
    2: ['reactive_plating', 'whetstone_array', 'coolant_lattice'],
    3: ['ablative_wedge', 'whetstone_array', 'ranging_spine', 'mirror_facet'],
  };
  const hull = act === 1 ? 55 : act === 2 ? 120 : 180;
  const weapon = act === 1 ? 'rail_repeater' : act === 2 ? 'plasma_cannon' : 'lance_battery';
  return build(`act${act}`, rosters[act] ?? [], 4, 3, hull, weapon);
}

/* ---------- running it ---------- */

function run(label: string, config: Config, runs: number): void {
  const rows: string[] = [];

  for (const [name, moduleIds] of Object.entries(BUILDS)) {
    for (const act of [1, 2, 3]) {
      let wins = 0;
      let turns = 0;
      let hull = 0;
      let strikes = 0;

      for (let i = 0; i < runs; i++) {
        const grid = act === 1 ? { w: 5, h: 3 } : act === 2 ? { w: 6, h: 3 } : { w: 7, h: 4 };
        const player = build(name, moduleIds, grid.w, grid.h, 70, WEAPON_FOR[name] ?? 'rail_repeater');
        const enemy = enemyFor(act);
        const result = fight(player, enemy, config, `${label}-${name}-${act}-${i}`);
        if (result.won) wins += 1;
        turns += result.turns;
        hull += result.hullLeft;
        strikes += result.strikes;
      }

      rows.push(
        `  ${name.padEnd(7)} act${act}  ` +
          `win ${String(Math.round((wins / runs) * 100)).padStart(3)}%  ` +
          `turns ${(turns / runs).toFixed(1).padStart(4)}  ` +
          `hull left ${(hull / runs).toFixed(0).padStart(3)}  ` +
          `strikes ${(strikes / runs).toFixed(1)}`,
      );
    }
  }

  console.log(`\n${label}`);
  console.log(rows.join('\n'));
}

const RUNS = 400;

console.log('shipsim — a prototype of the proposed space battle');
console.log(`${RUNS} fights per build per act. Real module pool, real stat aggregation.`);

run('A. no strikes at all (pure autobattler)', { strikeCost: null, disableTurns: 0, enemyStrikes: false }, RUNS);
run('B. strikes cost 2 Energy, 2 turns offline', { strikeCost: 2, disableTurns: 2, enemyStrikes: false }, RUNS);
run('C. strikes free, 2 turns offline', { strikeCost: 0, disableTurns: 2, enemyStrikes: false }, RUNS);
run('D. strikes cost 2, and they strike back', { strikeCost: 2, disableTurns: 2, enemyStrikes: true }, RUNS);
run('E. strikes cost 2, permanent disable', { strikeCost: 2, disableTurns: 99, enemyStrikes: false }, RUNS);
