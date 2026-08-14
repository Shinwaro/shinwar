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
  ThreadDef,
} from '../engine/types.ts';
import { THREADS } from './balance.ts';

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

/** Tests only. The game registers once at import and never clears. */
export function clearAllContent(): void {
  for (const table of [cards, enemies, modules, events, environments, masteries, threads]) {
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

    const seen = new Set<string>();
    for (const option of event.options) {
      if (seen.has(option.id)) issues.push({ where, problem: `duplicate option id '${option.id}'` });
      seen.add(option.id);
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
    if (thread.description.trim() === '') {
      issues.push({ where: `thread '${thread.id}'`, problem: 'blank description — the Manifest shows this' });
    }
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

function validateReferences(issues: ValidationIssue[]): void {
  // Dangling id check. Cards can name other cards via `addCardToHand`; walking
  // the effect tree catches those. As the op vocabulary grows this walk grows
  // with it — every reference a card can hold gets checked here or nowhere.
  for (const card of cards.all()) {
    const walk = (ops: readonly EffectOp[]): void => {
      for (const op of ops) {
        if (op.op === 'addCardToHand' && !cards.has(op.cardId)) {
          issues.push({ where: `card '${card.id}'`, problem: `references unknown card '${op.cardId}'` });
        }
        if (op.op === 'conditional') {
          walk(op.then);
          if (op.else !== undefined) walk(op.else);
        }
        if (op.op === 'scaleWith') walk(op.then);
      }
    };
    walk(card.effects);
    if (card.stanceRider !== undefined) walk(card.stanceRider.effects);
  }
}

/**
 * Validate everything. Returns the issues rather than throwing so the caller
 * chooses: the tests assert it is empty, and dev boot prints them.
 */
export function validateContent(): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateCards(issues);
  validateEvents(issues);
  validateThreads(issues);
  validateReferences(issues);
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
  };
}
