/* Ship combat: autoresolve with one high-leverage decision a turn.
 *
 * The build is the strategy. Each turn the grid ticks — reactors produce,
 * converters convert, the weapon fires — and the player's whole input is
 * choosing which single verb to spend. Which verbs exist at all is decided by
 * what is bolted to the grid, not by a menu: **modules grant verbs, not just
 * numbers.**
 *
 * Deliberately not a second card game. See SHIP.md.
 */

import type {
  GameState,
  InterventionId,
  ModuleDef,
  ModuleEffect,
  ShipCombatState,
  ShipEnemyDef,
  ShipPools,
  ShipResource,
  ShipState,
} from '../types.ts';
import { appendLog, requireRun, withRun } from '../state.ts';
import { nextFloat, weightedPick } from '../rng.ts';
import { modules as moduleTable, shipEnemies, weapons } from '../../content/registry.ts';
import { SHIP_COMBAT } from '../../content/balance.ts';
import { adjacencyActive } from './grid.ts';
import { orderedModules, shipStats } from './stats.ts';

const EMPTY_POOLS: ShipPools = { heat: 0, energy: 0, singularity: 0 };

export function requireShipCombat(state: GameState): ShipCombatState {
  const fight = state.run?.shipCombat;
  if (fight === undefined || fight === null) throw new Error('ship: no ship combat in progress');
  return fight;
}

function withShip(state: GameState, update: (fight: ShipCombatState) => ShipCombatState): GameState {
  const fight = requireShipCombat(state);
  return withRun(state, (run) => ({ ...run, shipCombat: update(fight) }));
}

/* ---------- reading the grid ----------
   Placement order is not iteration order: modules tick sorted by position so
   two ships with the same modules in different cells still resolve
   identically for the same seed. */

interface LiveModule {
  readonly def: ModuleDef;
  readonly effects: readonly ModuleEffect[];
  readonly adjacent: boolean;
}

export function liveModules(ship: ShipState): readonly LiveModule[] {
  return [...ship.placed]
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map((placed) => {
      const def = moduleTable.get(placed.moduleId);
      const adjacent = adjacencyActive(ship, placed.moduleId);
      return {
        def,
        adjacent,
        effects: adjacent ? [...def.effects, ...(def.adjacencyEffects ?? [])] : def.effects,
      };
    });
}

/** The verbs this build allows. An empty list is a fight you only watch. */
export function availableInterventions(ship: ShipState): readonly InterventionId[] {
  // Every mount can be pushed. Agency must never depend on owning the right
  // module — a ship with a bare grid still gets to make a decision.
  const verbs = new Set<InterventionId>(['overcharge']);
  for (const placed of ship.placed) {
    const granted = moduleTable.get(placed.moduleId).grants;
    if (granted !== undefined) verbs.add(granted);
  }
  return [...verbs].sort();
}

/* ---------- starting a fight ---------- */

export function startShipCombat(state: GameState, enemyId: string): GameState {
  const def: ShipEnemyDef = shipEnemies.get(enemyId);

  const seated = withRun(state, (run) => ({
    ...run,
    screen: 'shipCombat' as const,
    shipCombat: {
      turn: 0,
      pools: EMPTY_POOLS,
      shield: 0,
      amplify: 0,
      triggered: [],
      crit: false,
      enemy: {
        defId: def.id,
        hull: def.maxHull,
        maxHull: def.maxHull,
        shield: 0,
        intentMoveId: null,
        ai: { moveIndex: 0, lastMoveId: null, repeats: 0 },
        subsystems: def.subsystems.map((sub) => ({ id: sub.id, hp: sub.hp, maxHp: sub.hp })),
      },
      usedIntervention: null,
      target: 'hull',
      outcome: 'ongoing' as const,
    },
  }));

  return startShipTurn(
    appendLog(seated, {
      source: 'system',
      kind: 'combat',
      text: `Contact in open space: ${def.name}.`,
      detail: { enemy: def.id },
    }),
  );
}

/* ---------- the turn ---------- */

export function startShipTurn(state: GameState): GameState {
  const fight = requireShipCombat(state);
  if (fight.outcome !== 'ongoing') return state;

  const turn = fight.turn + 1;

  // Energy is per-turn, not banked: a resource that resets keeps every turn a
  // fresh decision. Heat and Singularity carry, because carrying is what makes
  // them worth building around.
  let next = withShip(state, (current) => ({
    ...current,
    turn,
    shield: 0,
    amplify: 0,
    usedIntervention: null,
    pools: { ...current.pools, energy: 0 },
  }));

  next = telegraphShip(next);

  return appendLog(next, {
    source: 'system',
    kind: 'combat',
    text: `Turn ${turn}.`,
    detail: { turn },
  });
}

/** Commit the enemy's move for the turn. Never re-rolled once the player acts. */
function telegraphShip(state: GameState): GameState {
  const fight = requireShipCombat(state);
  const def = shipEnemies.get(fight.enemy.defId);
  const ai = fight.enemy.ai;
  let rng = requireRun(state).rng;

  let moveId: string;
  let nextAi = ai;

  const script = def.script;
  if (script.kind === 'sequence') {
    const list = script.moves;
    const index = list.length === 0 ? 0 : ai.moveIndex % list.length;
    moveId = list[index] ?? def.moves[0]?.id ?? '';
    nextAi = {
      moveIndex: index + 1,
      lastMoveId: moveId,
      repeats: ai.lastMoveId === moveId ? ai.repeats + 1 : 1,
    };
  } else {
    const entries = script.entries
      .map((entry) => ({
        value: entry.move,
        weight: ai.lastMoveId === entry.move && ai.repeats >= script.maxRepeats ? 0 : entry.weight,
      }))
      .filter((entry) => entry.weight > 0);
    const usable =
      entries.length > 0 ? entries : script.entries.map((e) => ({ value: e.move, weight: e.weight }));
    const rolled = weightedPick(rng, 'combat', usable);
    rng = rolled.rng;
    moveId = rolled.value;
    nextAi = {
      moveIndex: ai.moveIndex + 1,
      lastMoveId: moveId,
      repeats: ai.lastMoveId === moveId ? ai.repeats + 1 : 1,
    };
  }

  return withRun(state, (run) => ({
    ...run,
    rng,
    shipCombat:
      run.shipCombat === null
        ? null
        : { ...run.shipCombat, enemy: { ...run.shipCombat.enemy, intentMoveId: moveId, ai: nextAi } },
  }));
}

export function shipIntent(state: GameState): ShipEnemyMoveView | null {
  const fight = state.run?.shipCombat ?? null;
  if (fight === null || fight.enemy.intentMoveId === null) return null;
  const def = shipEnemies.find(fight.enemy.defId);
  const move = def?.moves.find((entry) => entry.id === fight.enemy.intentMoveId);
  if (move === undefined) return null;
  return { label: move.label, damage: move.damage, shots: move.shots, shield: move.shield };
}

export interface ShipEnemyMoveView {
  readonly label: string;
  readonly damage: number;
  readonly shots: number;
  readonly shield: number;
}

/* ---------- interventions ---------- */

export function canIntervene(state: GameState, verb: InterventionId): boolean {
  const fight = state.run?.shipCombat ?? null;
  const run = state.run;
  if (fight === null || run === null || fight.outcome !== 'ongoing') return false;
  if (fight.usedIntervention !== null) return false;
  return availableInterventions(run.ship).includes(verb);
}

/** Spend the turn's one lever. Does not resolve the turn — that is a separate step. */
export function intervene(state: GameState, verb: InterventionId): GameState {
  if (!canIntervene(state, verb)) return state;

  let next = withShip(state, (fight) => {
    switch (verb) {
      case 'overcharge':
        return {
          ...fight,
          amplify: fight.amplify + SHIP_COMBAT.overchargeDamage,
          pools: { ...fight.pools, heat: fight.pools.heat + SHIP_COMBAT.overchargeHeat },
          usedIntervention: verb,
        };
      case 'vent':
        return {
          ...fight,
          pools: { ...fight.pools, heat: Math.max(0, fight.pools.heat - SHIP_COMBAT.ventAmount) },
          usedIntervention: verb,
        };
      case 'divert':
        return {
          ...fight,
          pools: { ...fight.pools, energy: fight.pools.energy + SHIP_COMBAT.divertEnergy },
          usedIntervention: verb,
        };
      case 'brace':
        return { ...fight, shield: fight.shield + SHIP_COMBAT.braceShield, usedIntervention: verb };
      case 'reposition':
        // The move itself happens through the grid actions; this only spends
        // the turn's lever so it cannot be done for free.
        return { ...fight, usedIntervention: verb };
      default: {
        const unreachable: never = verb;
        return unreachable;
      }
    }
  });

  return appendLog(next, {
    source: 'ship',
    kind: 'combat',
    text: `${VERB_LABEL[verb]}.`,
    detail: { intervention: verb },
  });
}

export const VERB_LABEL: { readonly [K in InterventionId]: string } = {
  overcharge: 'Overcharge',
  vent: 'Vent',
  divert: 'Divert',
  brace: 'Brace',
  reposition: 'Reposition',
};

export const VERB_TEXT: { readonly [K in InterventionId]: string } = {
  overcharge: `This turn's shots hit for ${SHIP_COMBAT.overchargeDamage} more. Costs ${SHIP_COMBAT.overchargeHeat} Heat.`,
  vent: `Dump ${SHIP_COMBAT.ventAmount} Heat now.`,
  divert: `Route ${SHIP_COMBAT.divertEnergy} extra Energy into the grid this turn.`,
  brace: `Absorb ${SHIP_COMBAT.braceShield} more damage this turn.`,
  reposition: 'Move one module to a free cell without losing the turn to it.',
};

/* ---------- resolving the turn ---------- */

function clampPools(pools: ShipPools): ShipPools {
  return {
    heat: Math.max(0, Math.min(SHIP_COMBAT.maxHeat, pools.heat)),
    energy: Math.max(0, pools.energy),
    singularity: Math.max(0, pools.singularity),
  };
}

function applyModuleEffects(
  pools: ShipPools,
  effects: readonly ModuleEffect[],
): { pools: ShipPools; damage: number; shield: number; amplifyFlat: number; amplifyPer: number; amplifyOf: ShipResource | null } {
  let next = pools;
  let damage = 0;
  let shield = 0;
  let amplifyFlat = 0;
  let amplifyPer = 0;
  let amplifyOf: ShipResource | null = null;

  for (const effect of effects) {
    switch (effect.kind) {
      case 'produce':
        next = { ...next, [effect.resource]: next[effect.resource] + effect.amount };
        break;
      case 'convert': {
        const moved = Math.min(next[effect.from], effect.cap);
        if (moved <= 0) break;
        next = {
          ...next,
          [effect.from]: next[effect.from] - moved,
          [effect.to]: next[effect.to] + moved * effect.rate,
        };
        break;
      }
      case 'damage':
        damage += effect.amount;
        break;
      case 'shield':
        shield += effect.amount;
        break;
      case 'amplify':
        amplifyFlat += effect.amount;
        if (effect.perResource !== undefined && effect.per !== undefined && effect.per > 0) {
          amplifyPer += effect.per;
          amplifyOf = effect.perResource;
        }
        break;
      default: {
        const unreachable: never = effect;
        return unreachable;
      }
    }
  }

  return { pools: clampPools(next), damage, shield, amplifyFlat, amplifyPer, amplifyOf };
}

/**
 * Run the turn: the grid ticks, the weapon fires, the enemy answers.
 *
 * Order is load-bearing. Producers run before converters in placement order,
 * so a reactor feeding a converter beside it works on the same turn rather
 * than a turn late — which is what makes adjacency feel like plumbing instead
 * of bookkeeping.
 */
export function resolveShipTurn(state: GameState): GameState {
  const fight = requireShipCombat(state);
  if (fight.outcome !== 'ongoing') return state;

  const run = requireRun(state);
  const ship = run.ship;
  let pools = fight.pools;
  let moduleDamage = 0;
  let shield = fight.shield;
  let amplify = fight.amplify;

  for (const live of liveModules(ship)) {
    const result = applyModuleEffects(pools, live.effects);
    pools = result.pools;
    moduleDamage += result.damage;
    shield += result.shield;
    amplify += result.amplifyFlat;
    if (result.amplifyOf !== null && result.amplifyPer > 0) {
      amplify += pools[result.amplifyOf] * result.amplifyPer;
    }
  }

  /*
   * The grid, as a build.
   *
   * Read AFTER the producers and converters have run, so scaling sees the pools
   * this turn actually has rather than last turn's. That ordering is the whole
   * Heat-into-crit chain: the cannon cooks the reactor, the converter reads the
   * heat, and the lens turns it into a crit chance — all inside one resolve.
   */
  const stats = shipStats(ship, pools);
  shield += stats.shieldPerTurn;

  const weapon = weapons.get(ship.weaponId);
  const shots = Math.max(1, weapon.shots + Math.round(stats.extraShots));
  const perShot = Math.max(0, weapon.damage + amplify + stats.flatDamage);
  pools = clampPools({ ...pools, heat: pools.heat + weapon.heat * shots });

  // Crit is rolled once for the volley rather than per shot: a swarm build
  // would otherwise crit somewhere every single turn and the stat would stop
  // being a spike and start being an average.
  const critChance = Math.min(0.85, stats.critChance);
  const rolled = nextFloat(requireRun(state).rng, 'combat');
  const crit = critChance > 0 && rolled.value < critChance;
  const critMultiplier = 1.5 + stats.critBonus;

  const weaponDamage = Math.round(perShot * shots * (crit ? critMultiplier : 1));
  const total = weaponDamage + moduleDamage;

  let next = withRun(state, (current) => ({ ...current, rng: rolled.rng }));
  next = withShip(next, (current) => ({
    ...current,
    pools,
    shield,
    amplify,
    // What fired, for the screen to light up in order.
    triggered: orderedModules(ship).map((placed) => placed.moduleId),
    crit,
  }));

  next = appendLog(next, {
    source: 'ship',
    kind: 'combat',
    text:
      `${weapon.name}: ${shots} x ${perShot}` +
      `${crit ? ` — CRIT x${critMultiplier.toFixed(2)}` : ''}` +
      `${moduleDamage > 0 ? ` +${moduleDamage} from the grid` : ''}.`,
    detail: { damage: total, crit },
  });

  next = damageEnemy(next, total, stats.pierce);

  // Lifesteal comes off what actually landed, not off what was rolled.
  if (stats.lifesteal > 0) {
    const healed = Math.round(stats.lifesteal);
    next = appendLog(
      withRun(next, (current) => ({
        ...current,
        ship: {
          ...current.ship,
          hull: Math.min(current.ship.maxHull, current.ship.hull + healed),
        },
      })),
      { source: 'ship', kind: 'combat', text: `Siphoned ${healed} back into the hull.`, detail: null },
    );
  }
  next = checkShipOutcome(next);
  if (requireShipCombat(next).outcome !== 'ongoing') return next;

  next = enemyShipActs(next);
  next = checkShipOutcome(next);
  if (requireShipCombat(next).outcome !== 'ongoing') return next;

  // Heat that is never vented is what eventually kills a greedy build.
  if (requireShipCombat(next).pools.heat >= SHIP_COMBAT.overheatAt) {
    const burn = SHIP_COMBAT.overheatDamage;
    next = appendLog(next, {
      source: 'heat',
      kind: 'heat',
      text: `Reactor overheating — the cutter takes ${burn}.`,
      detail: { damage: burn },
    });
    next = damageShip(next, burn, true);
    next = checkShipOutcome(next);
    if (requireShipCombat(next).outcome !== 'ongoing') return next;
  }

  return startShipTurn(next);
}

/** Is a named capability broken? */
export function subsystemBroken(state: GameState, disables: 'guns' | 'shields' | 'drive'): boolean {
  const fight = state.run?.shipCombat ?? null;
  if (fight === null) return false;
  const def = shipEnemies.find(fight.enemy.defId);
  return (def?.subsystems ?? []).some(
    (sub) =>
      sub.disables === disables &&
      (fight.enemy.subsystems.find((live) => live.id === sub.id)?.hp ?? 1) <= 0,
  );
}

/**
 * Put the volley where the player aimed it.
 *
 * Hull ends the fight sooner; a subsystem makes the rest of it cheaper. The
 * shield stands in front of the hull but not in front of a subsystem — you can
 * always get at the parts, which is what keeps aiming a live option rather
 * than something only worth doing on turn one.
 */
function damageEnemy(state: GameState, amount: number, pierce = 0): GameState {
  if (amount <= 0) return state;
  const fight = requireShipCombat(state);
  const def = shipEnemies.get(fight.enemy.defId);
  const name = def.name;

  // A broken drive means it cannot get out of the way.
  const exposed = subsystemBroken(state, 'drive');
  const total = exposed ? Math.floor(amount * 1.5) : amount;

  const aimed = fight.enemy.subsystems.find((sub) => sub.id === fight.target && sub.hp > 0);

  if (aimed !== undefined) {
    const subDef = def.subsystems.find((sub) => sub.id === aimed.id);
    const left = Math.max(0, aimed.hp - total);
    const next = withShip(state, (current) => ({
      ...current,
      enemy: {
        ...current.enemy,
        subsystems: current.enemy.subsystems.map((sub) =>
          sub.id === aimed.id ? { ...sub, hp: left } : sub,
        ),
      },
    }));

    const logged = appendLog(next, {
      source: 'ship',
      kind: 'damage',
      text: `${subDef?.name ?? aimed.id} takes ${Math.min(total, aimed.hp)}.`,
      detail: { to: 'enemy', toHull: 0, blocked: 0 },
    });

    if (left > 0) return logged;
    return appendLog(logged, {
      source: 'ship',
      kind: 'combat',
      text: `${subDef?.name ?? aimed.id} is wrecked. ${subDef?.text ?? ''}`,
      detail: { subsystem: aimed.id },
    });
  }

  // Pierce eats the shield before the shield eats the shot.
  const shielded = Math.max(0, fight.enemy.shield - Math.round(pierce));
  const absorbed = Math.min(shielded, total);
  const toHull = total - absorbed;

  const next = withShip(state, (current) => ({
    ...current,
    enemy: {
      ...current.enemy,
      shield: current.enemy.shield - absorbed,
      hull: Math.max(0, current.enemy.hull - toHull),
    },
  }));

  return appendLog(next, {
    source: 'ship',
    kind: 'damage',
    text:
      `${name} takes ${toHull}` +
      `${absorbed > 0 ? ` (${absorbed} shielded)` : ''}` +
      `${pierce > 0 && fight.enemy.shield > 0 ? ` — ${Math.round(pierce)} pierced` : ''}` +
      `${exposed ? ' — drive is gone' : ''}.`,
    detail: { to: 'enemy', toHull, blocked: absorbed },
  });
}

/** Aim the volley. Free, and re-decided every turn. */
export function aimAt(state: GameState, target: string): GameState {
  const fight = state.run?.shipCombat ?? null;
  if (fight === null || fight.outcome !== 'ongoing') return state;
  if (target !== 'hull' && !fight.enemy.subsystems.some((sub) => sub.id === target && sub.hp > 0)) {
    return state;
  }
  if (fight.target === target) return state;
  return withShip(state, (current) => ({ ...current, target }));
}

/** `ignoreShield` is for Heat: the reactor cooks you from the inside. */
function damageShip(state: GameState, amount: number, ignoreShield = false): GameState {
  if (amount <= 0) return state;
  const fight = requireShipCombat(state);
  // Reduction is plating, so it does not apply to the reactor cooking you from
  // the inside — that is what `ignoreShield` already marks.
  const reduction = ignoreShield
    ? 0
    : Math.round(shipStats(requireRun(state).ship, fight.pools).damageReduction);
  const incoming = Math.max(0, amount - reduction);
  if (incoming === 0) {
    return appendLog(state, {
      source: 'ship',
      kind: 'damage',
      text: 'Plating turns it aside entirely.',
      detail: { to: 'player', toHull: 0, blocked: amount },
    });
  }
  const absorbed = ignoreShield ? 0 : Math.min(fight.shield, incoming);
  const toHull = incoming - absorbed;

  let next = withShip(state, (current) => ({ ...current, shield: current.shield - absorbed }));
  next = withRun(next, (current) => ({
    ...current,
    ship: { ...current.ship, hull: Math.max(0, current.ship.hull - toHull) },
  }));

  return appendLog(next, {
    source: 'ship',
    kind: 'damage',
    text: `The cutter takes ${toHull}${absorbed > 0 ? ` (${absorbed} shielded)` : ''}.`,
    detail: { to: 'player', toHull, blocked: absorbed },
  });
}

function enemyShipActs(state: GameState): GameState {
  const fight = requireShipCombat(state);
  const def = shipEnemies.get(fight.enemy.defId);
  const move = def.moves.find((entry) => entry.id === fight.enemy.intentMoveId);
  if (move === undefined) return state;

  let next = appendLog(state, {
    source: 'enemy',
    kind: 'combat',
    text: `${def.name}: ${move.label}.`,
    detail: { move: move.id },
  });

  // A wrecked plate array cannot shield; a wrecked gun deck hits for half.
  // This is the payoff for spending turns on the parts instead of the hull.
  if (move.shield > 0 && !subsystemBroken(next, 'shields')) {
    next = withShip(next, (current) => ({
      ...current,
      enemy: { ...current.enemy, shield: current.enemy.shield + move.shield },
    }));
  }

  const blunted = subsystemBroken(next, 'guns');
  const perShot = blunted ? Math.floor(move.damage / 2) : move.damage;
  const incoming = perShot * move.shots;
  if (incoming > 0) next = damageShip(next, incoming);

  return next;
}

export function checkShipOutcome(state: GameState): GameState {
  const fight = state.run?.shipCombat ?? null;
  if (fight === null || fight.outcome !== 'ongoing') return state;

  if (fight.enemy.hull <= 0) return withShip(state, (current) => ({ ...current, outcome: 'won' }));
  if ((state.run?.ship.hull ?? 0) <= 0) {
    return withShip(state, (current) => ({ ...current, outcome: 'lost' }));
  }
  return state;
}
