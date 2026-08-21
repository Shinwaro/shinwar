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
  ImplantDef,
  RelicDef,
  RunEffect,
  StatusDef,
  ThreadDef,
} from '../engine/types.ts';
import { isRegistered } from '../engine/hooks.ts';
import { ACTIVE_STANCES, SCOPE, THREADS } from './balance.ts';
import { ENCOUNTERS } from './encounters.ts';

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
export const events = createTable<EventDef>('event');
export const environments = createTable<EnvironmentDef>('environment');
export const masteries = createTable<MasteryDef>('mastery');
export const relics = createTable<RelicDef>('relic');
export const implants = createTable<ImplantDef>('implant');
export const threads = createTable<ThreadDef>('thread');
export const statuses = createTable<StatusDef>('status');

/** Tests only. The game registers once at import and never clears. */
export function clearAllContent(): void {
  for (const table of [cards, enemies, events, environments, masteries, relics, implants, threads, statuses]) {
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

    /* Voided cards are exempt from both of the next two rules, and the
       exemption is the definition. A curse with an upgrade path is a card you
       would eventually want, and a curse that does something is a card. Doing
       nothing, forever, is the entire mechanic — so the validator has to stop
       asking them to be cards. It still demands they declare it: a `voided`
       that DOES carry effects is almost certainly a typo in the type. */
    if (card.type === 'voided') {
      if (card.upgrade !== undefined) {
        issues.push({ where, problem: 'a voided card must not have an `upgrade`' });
      }
      if (card.exclusive !== true) {
        issues.push({ where, problem: 'a voided card must be `exclusive`' });
      }
    } else {
      // Every other card has an upgrade. A card with nothing to upgrade into
      // is a dead choice at every forge for the rest of the run.
      if (card.upgrade === undefined) {
        issues.push({ where, problem: 'missing `upgrade`' });
      } else if (Object.keys(card.upgrade).length === 0) {
        issues.push({ where, problem: '`upgrade` is empty — it must change something' });
      }

      if (card.effects.length === 0 && card.stanceRider === undefined) {
        issues.push({ where, problem: 'no effects and no stance rider — the card does nothing' });
      }
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

function validateMasteries(issues: ValidationIssue[]): void {
  const active = new Set(ACTIVE_STANCES);

  for (const mastery of masteries.all()) {
    const where = `mastery '${mastery.id}'`;

    // A mastery on a dormant stance is a reward that does nothing. Catch it at
    // load rather than the first time a boss hands one out.
    if (!active.has(mastery.stance)) {
      issues.push({ where, problem: `rewrites stance '${mastery.stance}', which is not in rotation` });
    }
    if (mastery.text.trim() === '') {
      issues.push({ where, problem: 'no text — the reward screen shows this' });
    }
    if (Object.keys(mastery.overrides).length === 0) {
      issues.push({ where, problem: 'overrides nothing — a mastery must change the stance' });
    }
    // The stance strip must never describe the base stance after a mastery has
    // rewritten it. A strip that lies is worse than no strip.
    const changesBehaviour = Object.keys(mastery.overrides).some((key) => key !== 'text');
    if (changesBehaviour && (mastery.overrides.text ?? '').trim() === '') {
      issues.push({ where, problem: 'changes behaviour without rewriting the stance strip text' });
    }
  }
}

function validateRelics(issues: ValidationIssue[]): void {
  for (const relic of relics.all()) {
    const where = `relic '${relic.id}'`;
    if (relic.text.trim() === '') {
      issues.push({ where, problem: 'no text — the reward screen shows this' });
    }
    // A relic with no passive and no handler is a slot the player spent an act
    // finale on for nothing. Handlers are checked by the hook bus, so what can
    // be caught here is the declared half being empty on a relic that has no
    // handler registered either.
    const declares = relic.passive !== undefined && Object.keys(relic.passive).length > 0;
    if (!declares && !isRegistered(relic.id)) {
      issues.push({ where, problem: 'does nothing — no passive and no hook handler' });
    }
  }
}

function validateEnvironments(issues: ValidationIssue[]): void {
  for (const environment of environments.all()) {
    const where = `environment '${environment.id}'`;
    if (environment.text.trim() === '') {
      issues.push({ where, problem: 'no badge text — the map shows this before the player commits' });
    }
    if (environment.acts !== undefined && environment.acts.length === 0) {
      issues.push({ where, problem: 'appears in no act' });
    }
  }
}

function validateEncounters(issues: ValidationIssue[]): void {
  const known = new Set(enemies.ids());
  // Encounters are a static list rather than a registry table, so they are the
  // one pool that does not empty with `clearAllContent()`. Checking them against
  // a fixture that registered three cards and no enemies would report the whole
  // shipped roster as dangling, so the pool checks want a loaded roster.
  if (known.size === 0) return;

  for (const encounter of ENCOUNTERS) {
    const where = `encounter '${encounter.id}'`;
    if (encounter.enemyIds.length === 0) issues.push({ where, problem: 'no enemies' });
    for (const id of encounter.enemyIds) {
      if (!known.has(id)) issues.push({ where, problem: `names unknown enemy '${id}'` });
    }
    // An encounter whose enemies belong to another act quietly imports that
    // act's damage band, which is the least visible way to break pacing.
    for (const id of encounter.enemyIds) {
      const def = enemies.find(id);
      if (def !== undefined && def.act !== encounter.act) {
        issues.push({ where, problem: `${id} is an act ${def.act} enemy in an act ${encounter.act} encounter` });
      }
    }
  }

  // Every act needs every tier. A missing roster used to fall back to the
  // normal pool, which made an elite a normal fight with elite rewards.
  for (const act of [1, 2, 3] as const) {
    for (const tier of ['normal', 'elite', 'boss'] as const) {
      const pool = ENCOUNTERS.filter((entry) => entry.act === act && entry.tier === tier);
      if (pool.length === 0) {
        issues.push({ where: 'encounter pool', problem: `act ${act} has no ${tier} encounters` });
      }
    }
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
  validateMasteries(issues);
  validateRelics(issues);
  validateEnvironments(issues);
  validateEncounters(issues);
  validateReferences(issues);
  validateKeywordBudget(issues);
  return issues;
}

export function contentCounts(): Readonly<Record<string, number>> {
  return {
    cards: cards.all().length,
    enemies: enemies.all().length,
    events: events.all().length,
    environments: environments.all().length,
    masteries: masteries.all().length,
    relics: relics.all().length,
    implants: implants.all().length,
    threads: threads.all().length,
    statuses: statuses.all().length,
  };
}
