/* The content registry.
 *
 * Content is data, not code: adding a card means editing one file under
 * `src/content/` and nothing else. This file is what makes that true — it
 * collects the definitions, hands them out by id, and validates the whole set
 * in one pass at boot (in dev) and in the tests (always).
 *
 * One rule worth stating loudly: `all()` returns definitions **sorted by id**,
 * never in registration order. Reward pools, shop stocks and encounter tables
 * iterate these lists, and if their order depended on which file imported
 * which first, a harmless import reshuffle would silently change every seed.
 */

import type {
  CardDef,
  EffectOp,
  EnemyDef,
  EnvironmentDef,
  EventDef,
  MasteryDef,
  ModuleDef,
  RunEffect,
  ShipEnemyDef,
  StatusDef,
  ThreadDef,
  WeaponDef,
} from '../engine/types.ts';
import { ACTIVE_STANCES, SCOPE, THREADS } from './balance.ts';

interface Table<T extends { readonly id: string }> {
  register(defs: readonly T[]): void;
  get(id: string): T;
  find(id: string): T | undefined;
  has(id: string): boolean;
  all(): readonly T[];
  ids(): readonly string[];
  clear(): void;
}

function createTable<T extends { readonly id: string }>(label: string): Table<T> {
  const items = new Map<string, T>();

  return {
    register(defs) {
      for (const def of defs) {
        if (items.has(def.id)) throw new Error(`content: duplicate ${label} id '${def.id}'`);
        items.set(def.id, def);
      }
    },
    get(id) {
      const found = items.get(id);
      if (found === undefined) throw new Error(`content: no ${label} with id '${id}'`);
      return found;
    },
    find(id) {
      return items.get(id);
    },
    has(id) {
      return items.has(id);
    },
    all() {
      return [...items.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    ids() {
      return [...items.keys()].sort();
    },
    clear() {
      items.clear();
    },
  };
}

export const cards = createTable<CardDef>('card');
export const enemies = createTable<EnemyDef>('enemy');
export const modules = createTable<ModuleDef>('module');
export const events = createTable<EventDef>('event');
export const environments = createTable<EnvironmentDef>('environment');
export const masteries = createTable<MasteryDef>('mastery');
export const threads = createTable<ThreadDef>('thread');
export const statuses = createTable<StatusDef>('status');
export const weapons = createTable<WeaponDef>('weapon');
export const shipEnemies = createTable<ShipEnemyDef>('ship enemy');

/** Tests only. The game registers once at import and never clears. */
export function clearAllContent(): void {
  for (const table of [cards, enemies, modules, events, environments, masteries, threads, statuses, weapons, shipEnemies]) {
    table.clear();
  }
}

/* ---------- validation ---------- */

export interface ValidationIssue {
  readonly where: string;
  readonly problem: string;
}

function validateCards(issues: ValidationIssue[]): void {
  for (const card of cards.all()) {
    const where = `card '${card.id}'`;

    // Every card has an upgrade. A card with nothing to upgrade into is a
    // dead choice at every forge for the rest of the run.
    if (card.upgrade === undefined) {
      issues.push({ where, problem: 'missing `upgrade`' });
    } else if (Object.keys(card.upgrade).length === 0) {
      issues.push({ where, problem: '`upgrade` is empty — it must change something' });
    }

    if (card.effects.length === 0 && card.stanceRider === undefined) {
      issues.push({ where, problem: 'no effects and no stance rider — the card does nothing' });
    }

    if (typeof card.cost === 'number' && card.cost < 0) {
      issues.push({ where, problem: `negative cost ${card.cost}` });
    }

    if (card.name.trim() === '') {
      issues.push({ where, problem: 'blank name' });
    }
  }
}

/** Every id a run effect can name gets checked here or nowhere. */
function walkRunEffects(where: string, effects: readonly RunEffect[], issues: ValidationIssue[]): void {
  for (const effect of effects) {
    if (effect.op === 'card' && !cards.has(effect.cardId)) {
      issues.push({ where, problem: `references unknown card '${effect.cardId}'` });
    }
    if (effect.op === 'module' && !modules.has(effect.moduleId)) {
      issues.push({ where, problem: `references unknown module '${effect.moduleId}'` });
    }
    if ((effect.op === 'setThread' || effect.op === 'resolveThread') && !threads.has(effect.threadId)) {
      issues.push({ where, problem: `references unknown thread '${effect.threadId}'` });
    }
  }
}

function validateEvents(issues: ValidationIssue[]): void {
  for (const event of events.all()) {
    const where = `event '${event.id}'`;

    // Three real options plus an always-available, always-worthless "leave".
    // The leave option is what makes the others feel like decisions rather
    // than a slot machine you are forced to pull.
    const leaves = event.options.filter((option) => option.isLeave === true);
    const real = event.options.filter((option) => option.isLeave !== true);

    if (real.length < 3) {
      issues.push({ where, problem: `${real.length} real options, needs at least 3` });
    }
    if (leaves.length !== 1) {
      issues.push({ where, problem: `${leaves.length} "leave" options, needs exactly 1` });
    }

    // A "leave" that pays anything at all stops being worthless, and the moment
    // it does, every other option on the screen has to beat it instead of
    // beating nothing. That is the whole load this option carries.
    for (const leave of leaves) {
      if (leave.effects.length > 0) {
        issues.push({ where, problem: '"leave" has effects — it must be genuinely worthless' });
      }
    }

    // At least one option defers its consequence. An Anomaly where everything
    // settles on the spot is a vending machine.
    if (!real.some((option) => option.effects.some((effect) => effect.op === 'setThread'))) {
      issues.push({ where, problem: 'no option opens a Thread' });
    }

    if (event.body.trim() === '') issues.push({ where, problem: 'no body text' });

    const seen = new Set<string>();
    for (const option of event.options) {
      if (seen.has(option.id)) issues.push({ where, problem: `duplicate option id '${option.id}'` });
      seen.add(option.id);

      const spot = `${where} option '${option.id}'`;
      // Legible risk categories rather than hidden dice — DESIGN.md §4.
      if (option.risk.trim() === '') issues.push({ where: spot, problem: 'no risk category' });
      if (option.payoff.trim() === '') issues.push({ where: spot, problem: 'no payoff category' });
      if (option.detail.trim() === '') issues.push({ where: spot, problem: 'no framing text' });
      if (option.effects.length === 0 && option.isLeave !== true) {
        issues.push({ where: spot, problem: 'does nothing, and is not the "leave"' });
      }
      walkRunEffects(spot, option.effects, issues);
    }
  }
}

function validateThreads(issues: ValidationIssue[]): void {
  const all = threads.all();
  if (all.length === 0) return;

  // If threads are only punishments, players stop engaging with events.
  const counts = { positive: 0, mixed: 0, costly: 0 };
  for (const thread of all) {
    counts[thread.tone] += 1;
    const where = `thread '${thread.id}'`;

    if (thread.description.trim() === '') {
      issues.push({ where, problem: 'blank description — the Manifest shows this' });
    }
    // The player must always be able to see that they are Marked. That needs
    // both halves: what they are carrying, and what kind of thing is coming.
    if (thread.omen.trim() === '') {
      issues.push({ where, problem: 'blank omen — the player is owed the category' });
    }
    if (thread.trigger.count < 1) {
      issues.push({ where, problem: `trigger fires after ${thread.trigger.count} nodes` });
    }
    if (thread.payoff.length === 0) {
      issues.push({ where, problem: 'no payoff — a Thread that resolves into nothing is a lie' });
    }
    if (thread.cargoModuleId !== undefined && !modules.has(thread.cargoModuleId)) {
      issues.push({ where, problem: `cargo names unknown module '${thread.cargoModuleId}'` });
    }
    walkRunEffects(where, thread.payoff, issues);
  }

  for (const tone of ['positive', 'mixed', 'costly'] as const) {
    const share = counts[tone] / all.length;
    const target = THREADS.toneMix[tone];
    if (Math.abs(share - target) > THREADS.toneMixTolerance) {
      issues.push({
        where: 'thread pool',
        problem:
          `${tone} share is ${(share * 100).toFixed(0)}%, target ` +
          `${(target * 100).toFixed(0)}% ±${(THREADS.toneMixTolerance * 100).toFixed(0)}`,
      });
    }
  }
}

/**
 * Walk an effect tree and report every id it names that does not resolve.
 * As the op vocabulary grows this walk grows with it — every reference an
 * effect can hold gets checked here or nowhere.
 */
function walkReferences(where: string, ops: readonly EffectOp[], issues: ValidationIssue[]): void {
  for (const op of ops) {
    if (op.op === 'addCardToHand' && !cards.has(op.cardId)) {
      issues.push({ where, problem: `references unknown card '${op.cardId}'` });
    }
    if (op.op === 'applyStatus' && !statuses.has(op.status)) {
      issues.push({ where, problem: `references unknown status '${op.status}'` });
    }
    if (op.op === 'conditional') {
      if (op.when.kind === 'targetHasStatus' && !statuses.has(op.when.status)) {
        issues.push({ where, problem: `references unknown status '${op.when.status}'` });
      }
      walkReferences(where, op.then, issues);
      if (op.else !== undefined) walkReferences(where, op.else, issues);
    }
    if (op.op === 'scaleWith') walkReferences(where, op.then, issues);
  }
}

function validateReferences(issues: ValidationIssue[]): void {
  for (const card of cards.all()) {
    const where = `card '${card.id}'`;
    walkReferences(where, card.effects, issues);
    if (card.stanceRider !== undefined) walkReferences(where, card.stanceRider.effects, issues);
  }

  for (const enemy of enemies.all()) {
    for (const move of enemy.moves) {
      walkReferences(`enemy '${enemy.id}' move '${move.id}'`, move.effects, issues);
    }
  }
}

function validateEnemies(issues: ValidationIssue[]): void {
  for (const enemy of enemies.all()) {
    const where = `enemy '${enemy.id}'`;
    const moveIds = new Set(enemy.moves.map((move) => move.id));

    if (enemy.moves.length === 0) issues.push({ where, problem: 'no moves' });
    if (enemy.maxHp <= 0) issues.push({ where, problem: `maxHp ${enemy.maxHp}` });

    // An enemy whose script names a move it does not have would throw mid-fight,
    // which is the worst possible time to find out.
    const named =
      enemy.script.kind === 'sequence'
        ? enemy.script.moves
        : enemy.script.entries.map((entry) => entry.move);

    if (named.length === 0) issues.push({ where, problem: 'script names no moves' });
    for (const id of named) {
      if (!moveIds.has(id)) issues.push({ where, problem: `script names unknown move '${id}'` });
    }

    if (enemy.script.kind === 'weighted' && enemy.script.maxRepeats < 1) {
      issues.push({ where, problem: 'maxRepeats must be at least 1' });
    }

    // Every move must telegraph something. A blank intent is a turn the player
    // cannot plan around, and unpreviewable damage is the definition of unfair.
    for (const move of enemy.moves) {
      if (move.intent.length === 0) {
        issues.push({ where: `${where} move '${move.id}'`, problem: 'telegraphs nothing' });
      }
    }
  }
}

function validateStances(issues: ValidationIssue[]): void {
  // A card whose rider names a retired stance is a card with a dead half — it
  // would render greyed forever and never fire. Catch it at load, not in play.
  const active = new Set(ACTIVE_STANCES);

  for (const card of cards.all()) {
    const where = `card '${card.id}'`;
    const rider = card.stanceRider;
    if (rider !== undefined && !active.has(rider.stance)) {
      issues.push({ where, problem: `rider needs stance '${rider.stance}', which is not in rotation` });
    }

    const walk = (ops: readonly EffectOp[]): void => {
      for (const op of ops) {
        if (op.op === 'setStance' && !active.has(op.stance)) {
          issues.push({ where, problem: `sets stance '${op.stance}', which is not in rotation` });
        }
        if (op.op === 'conditional') {
          if (op.when.kind === 'stanceIs' && !active.has(op.when.stance)) {
            issues.push({ where, problem: `tests for stance '${op.when.stance}', which is not in rotation` });
          }
          walk(op.then);
          if (op.else !== undefined) walk(op.else);
        }
        if (op.op === 'scaleWith') walk(op.then);
      }
    };
    walk(card.effects);
    if (rider !== undefined) walk(rider.effects);
  }
}

function validateKeywordBudget(issues: ValidationIssue[]): void {
  // Depth comes from stance and heat recontextualising a small vocabulary, not
  // from more nouns. Statuses are the part of the keyword count that grows
  // without anyone noticing, so it is counted.
  const count = statuses.all().length;
  if (count > SCOPE.keywordCap) {
    issues.push({
      where: 'keyword budget',
      problem: `${count} statuses against a cap of ${SCOPE.keywordCap} keywords`,
    });
  }
}

/**
 * Validate everything. Returns the issues rather than throwing so the caller
 * chooses: the tests assert it is empty, and dev boot prints them.
 */
export function validateContent(): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateCards(issues);
  validateStances(issues);
  validateEnemies(issues);
  validateEvents(issues);
  validateThreads(issues);
  validateReferences(issues);
  validateKeywordBudget(issues);
  return issues;
}

export function contentCounts(): Readonly<Record<string, number>> {
  return {
    cards: cards.all().length,
    enemies: enemies.all().length,
    modules: modules.all().length,
    events: events.all().length,
    environments: environments.all().length,
    masteries: masteries.all().length,
    threads: threads.all().length,
    statuses: statuses.all().length,
    weapons: weapons.all().length,
    shipEnemies: shipEnemies.all().length,
  };
}
