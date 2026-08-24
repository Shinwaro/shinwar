/* Dump every content pool as JSON, for the reference pages.
 *
 * `npm run dump` — writes `tools/out/pools.json`, which is gitignored because
 * it is derived and would be stale in the diff the moment anything changed.
 *
 * The whole point is that nothing in a reference table is typed by a person.
 * A hand-maintained list of a hundred cards is wrong within a week, and a
 * reference that disagrees with the game is worse than no reference at all —
 * so every rules string here comes from `describeCard`, `describeRider` and
 * `describeImplant`, which are the same functions that print the text on
 * screen. If the card changes, this changes, and nobody has to remember.
 *
 * It also carries the derived numbers the tables cannot compute for
 * themselves — an encounter's total hull, an enemy's average damage a turn —
 * because those are the figures a balance pass actually reads, and working
 * them out in the page would put game arithmetic somewhere it does not belong.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reloadContent } from '../src/content/index.ts';
import { ENCOUNTERS } from '../src/content/encounters.ts';
import { STARTING_DECK } from '../src/content/cards/basic.ts';
import { KEYWORDS } from '../src/content/keywords.ts';
import {
  cards,
  enemies,
  environments,
  events,
  implants,
  masteries,
  relics,
  statuses,
  threads,
} from '../src/content/registry.ts';
import { describeCard, describeRider } from '../src/engine/combat/describe.ts';
import { describeImplant, describeRunEffects } from '../src/engine/run/describe.ts';
import type { CardDef } from '../src/engine/types.ts';

reloadContent();

const startingCounts = new Map<string, number>();
for (const id of STARTING_DECK) startingCounts.set(id, (startingCounts.get(id) ?? 0) + 1);

/** What an enemy puts out in an average turn, from its telegraphs. */
function damagePerTurn(id: string): number {
  const def = enemies.find(id);
  if (def === undefined || def.moves.length === 0) return 0;
  const perMove = def.moves.map((move) =>
    move.intent.reduce(
      (sum, hit) => sum + (hit.kind === 'attack' ? hit.amount * Math.max(1, hit.times) : 0),
      0,
    ),
  );
  return Math.round(perMove.reduce((a, b) => a + b, 0) / perMove.length);
}

const pools = {
  cards: cards.all().map((card) => ({
    id: card.id,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    archetype: card.archetype,
    cost: card.cost,
    text: describeCard(card),
    rider: describeRider(card),
    riderStance: card.stanceRider?.stance ?? null,
    exclusive: card.exclusive === true,
    exhaust: card.exhaust === true,
    innate: card.innate === true,
    starting: startingCounts.get(card.id) ?? 0,
    upgraded:
      card.upgrade === undefined ? null : describeCard({ ...card, ...card.upgrade } as CardDef),
    upgradedCost:
      card.upgrade === undefined ? null : ({ ...card, ...card.upgrade } as CardDef).cost,
    flavor: card.flavor ?? null,
  })),

  relics: relics.all().map((relic) => ({
    id: relic.id,
    name: relic.name,
    rarity: relic.rarity,
    /* Out of every offer; granted by name. The pages say so, because a relic
       you cannot find is the single most confusing thing a reference can list
       without comment. */
    exclusive: relic.exclusive === true,
    text: relic.text,
    flavor: relic.flavor ?? null,
  })),

  implants: implants.all().map((implant) => ({
    id: implant.id,
    name: implant.name,
    rarity: implant.rarity,
    price: implant.price,
    max: implant.maxStacks,
    text: describeImplant(implant),
    flavor: implant.flavor ?? null,
  })),

  environments: environments.all().map((env) => ({
    id: env.id,
    name: env.name,
    text: env.text,
    acts: env.acts ?? [1, 2, 3],
    rules: env.rules ?? null,
  })),

  enemies: enemies.all().map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    act: enemy.act,
    tier: enemy.tier,
    hull: enemy.maxHp,
    damagePerTurn: damagePerTurn(enemy.id),
    script: enemy.script.kind,
    moves: enemy.moves.map((move) => ({
      label: move.label,
      intent: move.intent.map((hit) =>
        hit.kind === 'attack'
          ? `${hit.times > 1 ? `${hit.times} x ` : ''}${hit.amount}`
          : hit.label,
      ),
    })),
    flavor: enemy.flavor ?? null,
  })),

  encounters: ENCOUNTERS.map((encounter) => ({
    id: encounter.id,
    name: encounter.name,
    act: encounter.act,
    tier: encounter.tier,
    minRow: encounter.minRow ?? null,
    tutorial: encounter.tutorial === true,
    enemyIds: [...encounter.enemyIds],
    hull: encounter.enemyIds.reduce((sum, id) => sum + (enemies.find(id)?.maxHp ?? 0), 0),
    damagePerTurn: encounter.enemyIds.reduce((sum, id) => sum + damagePerTurn(id), 0),
  })),

  masteries: masteries.all().map((mastery) => ({
    id: mastery.id,
    name: mastery.name,
    stance: mastery.stance,
    text: mastery.text,
  })),

  statuses: statuses.all().map((status) => ({
    id: status.id,
    name: status.name,
    kind: status.kind,
    text: status.text,
  })),

  threads: threads.all().map((thread) => ({
    id: thread.id,
    name: thread.name,
    tone: thread.tone,
    description: thread.description,
    omen: thread.omen,
    after: thread.trigger.count,
    payoff: describeRunEffects(thread.payoff),
    repeatable: thread.repeatable === true,
    mastery:
      thread.mastery === undefined
        ? null
        : { after: thread.mastery.after, effects: describeRunEffects(thread.mastery.effects) },
  })),

  /* The glossary, straight from the pool the card text is checked against. */
  keywords: KEYWORDS.map((keyword) => ({ name: keyword.name, text: keyword.text })),

  events: events.all().map((event) => ({
    id: event.id,
    name: event.name,
    body: event.body,
    options: event.options.map((option) => ({
      id: option.id,
      label: option.label,
      detail: option.detail,
      risk: option.risk,
      payoff: option.payoff,
      isLeave: option.isLeave === true,
      effects: describeRunEffects(option.effects),
    })),
  })),
} as const;

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'pools.json'), `${JSON.stringify(pools, null, 1)}\n`, 'utf8');

const counts = Object.entries(pools)
  .map(([key, value]) => `${value.length} ${key}`)
  .join(', ');
process.stdout.write(`tools/out/pools.json — ${counts}\n`);
