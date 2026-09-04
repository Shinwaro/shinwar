/* The Manifest — every card, relic, implant and enemy in one table.
 *
 * Nothing here is written by hand. The rules text comes from `describeCard`,
 * which is the same function that prints the text on the card in the game, so
 * the page cannot drift from the build the way a typed-up list does.
 */

import type { Pools } from '../dump.ts';
import { by, chip, esc, fill, rank, table, tierRank } from './html.ts';
import {
  BOSS_IMPLANT_WEIGHTS,
  ELITE_CARD_WEIGHTS,
  RARITY_WEIGHTS,
  RELIC_COMBAT_CHANCE,
  RELIC_COMBAT_PITY,
  RELIC_COMBAT_WEIGHTS,
  RELIC_ELITE_WEIGHTS,
} from '../../src/content/balance.ts';

/* ---------- the odds ----------
 *
 * Read out of `balance.ts` and normalised here rather than transcribed, so the
 * page cannot drift from the game the way a hand-kept table would. Weights are
 * per CARD, so a tier's share of a screen is its weight times how many cards
 * are written at that tier — which is why the pool sizes are printed beside
 * the percentages instead of being left implicit.
 */

type Weights = { readonly [tier: string]: number };

const TIERS = ['common', 'uncommon', 'epic', 'legendary', 'mythic', 'artifact'] as const;

/**
 * A weight table as real percentages — and the two rolls weight differently.
 *
 * `perCard` is how `rollCardChoices` works: every candidate CARD becomes an
 * entry carrying its tier's weight, so a tier's share of the screen is its
 * weight times how many cards are written at it. Ten uncommons at 33 beat five
 * commons at 48, which is not what the raw table looks like.
 *
 * `perTier` is how `rollRelics` and `rollBossImplants` work: the TIER is rolled
 * first and then sampled from, so the pool size decides only whether a tier can
 * come up at all. Multiplying by it would have made this page state odds the
 * game does not roll, which is worse than having no page.
 */
function share(
  weights: Weights,
  pool: (tier: string) => number,
  mode: 'perCard' | 'perTier',
): string {
  const live = TIERS.filter((tier) => (weights[tier] ?? 0) > 0 && pool(tier) > 0);
  const size = (tier: string): number => (mode === 'perCard' ? pool(tier) : 1);
  const total = live.reduce((sum, tier) => sum + (weights[tier] ?? 0) * size(tier), 0);
  if (total === 0) return '<span class="dim">never</span>';
  return live
    .map((tier) => {
      const pct = (((weights[tier] ?? 0) * size(tier)) / total) * 100;
      return `${chip(tier)} <span class="mono">${pct.toFixed(pct < 10 ? 1 : 0)}%</span>`;
    })
    .join(' &middot; ');
}

function oddsSection(pools: Pools): string {
  /* How many OFFERABLE cards sit at each tier. A weight is per card, so this is
     the multiplier that turns a weight into a share of the screen. `basic` is
     excluded the same way the roll excludes it. */
  const cardsAt = (tier: string): number =>
    pools.cards.filter((card) => card.rarity === tier && card.rarity !== 'basic' && !card.exclusive)
      .length;
  const relicsAt = (tier: string): number =>
    pools.relics.filter((relic) => relic.rarity === tier && !relic.exclusive).length;
  const implantsAt = (tier: string): number =>
    pools.implants.filter((implant) => implant.rarity === tier).length;

  const acts = [1, 2, 3] as const;

  const cardTable = table(
    acts.map((act) => ({ act })),
    ['Act', 'An ordinary fight or a Station', 'An Elite'],
    [
      (row) => `<span class="nm">Act ${row.act}</span>`,
      (row) => share(RARITY_WEIGHTS[row.act], cardsAt, 'perCard'),
      (row) => share(ELITE_CARD_WEIGHTS[row.act], cardsAt, 'perCard'),
    ],
  );

  const relicTable = table(
    acts.map((act) => ({ act })),
    ['Act', 'Chance a normal fight drops one', 'If it does', 'An Elite'],
    [
      (row) => `<span class="nm">Act ${row.act}</span>`,
      (row) =>
        RELIC_COMBAT_CHANCE[row.act] === 0
          ? '<span class="dim">never</span>'
          : `<span class="mono">${Math.round(RELIC_COMBAT_CHANCE[row.act] * 100)}%</span>`,
      (row) =>
        RELIC_COMBAT_CHANCE[row.act] === 0
          ? '<span class="dim">&mdash;</span>'
          : share(RELIC_COMBAT_WEIGHTS, relicsAt, 'perTier'),
      (row) => share(RELIC_ELITE_WEIGHTS[row.act], relicsAt, 'perTier'),
    ],
  );

  const pity = `
    <p class="lede">
      The ordinary-fight roll bends both ways around the base rate.
      <span class="mono">${RELIC_COMBAT_PITY.neutral}</span> fights since the last drop pays
      exactly the base; each fight either side of that moves it
      <span class="mono">${Math.round(RELIC_COMBAT_PITY.step * 100)}%</span>, between a floor of
      <span class="mono">${Math.round(RELIC_COMBAT_PITY.floor * 100)}%</span> and a ceiling of
      <span class="mono">${Math.round(RELIC_COMBAT_PITY.max * 100)}%</span> — so a run that just
      took one is less likely to take the next. It stops entirely once a run has taken
      <span class="mono">${RELIC_COMBAT_PITY.cap}</span>. Elites and bosses are untouched.
    </p>
    ${table(
      [0, 1, 2, 3, 4, 5, 6].map((dry) => ({ dry })),
      ['Dry fights', ...acts.map((act) => `Act ${act}`)],
      [
        (row) => `<span class="mono">${row.dry}</span>`,
        ...acts.map(
          (act) => (row: { dry: number }) => {
            const base = RELIC_COMBAT_CHANCE[act];
            if (base <= 0) return '<span class="dim">&mdash;</span>';
            const gap = row.dry - RELIC_COMBAT_PITY.neutral;
            const drift = base + gap * RELIC_COMBAT_PITY.step;
            const chance = Math.min(
              RELIC_COMBAT_PITY.max,
              Math.max(RELIC_COMBAT_PITY.floor, drift),
            );
            return `<span class="mono">${Math.round(chance * 100)}%</span>`;
          },
        ),
      ],
    )}`;

  const bossTable = table(
    [{ label: 'Implants, at a boss' }],
    ['Row', 'Tier'],
    [
      (row) => `<span class="nm">${esc(row.label)}</span>`,
      () => share(BOSS_IMPLANT_WEIGHTS, implantsAt, 'perTier'),
    ],
  );

  return [
    '<h3>Cards</h3>',
    '<p class="lede">A boss offers one flat tier instead of rolling; an Elite cannot offer a common at all.</p>',
    cardTable,
    '<h3>Relics</h3>',
    '<p class="lede">A boss pays a fixed tier. An Elite always drops, and never a common.</p>',
    relicTable,
    '<h3>Bad-luck protection</h3>',
    pity,
    '<h3>Implants</h3>',
    '<p class="lede">Bought at a Station at the price on the table above. The roll below is the boss row, which is the only place they are offered rather than sold.</p>',
    bossTable,
  ].join('\n');
}

export function buildManifest(pools: Pools, template: string): string {
  const names = new Map(pools.enemies.map((enemy) => [enemy.id, enemy.name]));

  const cards = [...pools.cards].sort(by((c) => rank(c.rarity), (c) => c.name));
  const cardRows = cards
    .map((card) => {
      const tags = [
        card.starting ? `<span class="tag tag--start">deck &times;${card.starting}</span>` : '',
        card.exhaust ? '<span class="tag">exhaust</span>' : '',
        card.innate ? '<span class="tag">innate</span>' : '',
      ].join('');
      const rider =
        card.rider === null || card.rider === ''
          ? ''
          : `<div class="rider"><span class="rider-k">${esc(
              (card.riderStance ?? '').toUpperCase(),
            )}</span>${esc(card.rider)}</div>`;
      const cost =
        card.upgradedCost === card.cost ? '' : `<span class="cost">${esc(card.upgradedCost)}</span>`;
      const upgrade =
        card.upgraded === null
          ? ''
          : `<div class="up"><span class="up-k">+</span>${cost}<div>${esc(card.upgraded)}</div></div>`;
      return (
        `<tr data-rarity="${card.rarity}" data-type="${card.type}">` +
        `<td class="c-cost"><span class="cost">${esc(card.cost)}</span></td>` +
        `<td class="c-name"><span class="nm">${esc(card.name)}</span>` +
        `<span class="sub">${esc(card.type)} &middot; ${esc(card.archetype)}</span>` +
        `${tags}</td>` +
        `<td class="c-tier">${chip(card.rarity)}</td>` +
        `<td class="c-text">${esc(card.text)}${rider}${upgrade}</td>` +
        `</tr>`
      );
    })
    .join('');

  const mix = (values: readonly string[], order?: readonly string[]): string => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    const keys = order ?? [...counts.keys()].sort();
    return keys
      .filter((key) => (counts.get(key) ?? 0) > 0)
      .map((key) => `${counts.get(key) ?? 0} ${key}`)
      .join(' &middot; ');
  };

  const relics = [...pools.relics].sort(by((r) => rank(r.rarity), (r) => r.name));
  const implants = [...pools.implants].sort(by((i) => rank(i.rarity), (i) => i.name));
  const enemies = [...pools.enemies].sort(
    by((e) => e.act, (e) => tierRank(e.tier), (e) => e.name),
  );
  const encounters = [...pools.encounters].sort(
    by((e) => e.act, (e) => tierRank(e.tier), (e) => e.name),
  );

  return fill(template, {
    ODDS: oddsSection(pools),
    CARDROWS: cardRows,

    RELICS: table(relics, ['Relic', 'Tier', 'Effect'], [
      (r) => `<span class="nm">${esc(r.name)}</span>${r.exclusive ? ' <span class="tag">earned</span>' : ''}`,
      (r) => chip(r.rarity),
      (r) => esc(r.text),
    ]),

    IMPLANTS: table(implants, ['Implant', 'Tier', 'Alloy', 'Max', 'Effect'], [
      (i) => `<span class="nm">${esc(i.name)}</span>`,
      (i) => chip(i.rarity),
      (i) => `<span class="mono">${i.price}</span>`,
      (i) => `<span class="mono">${i.max}</span>`,
      (i) => esc(i.text),
    ]),

    ENVS: table(pools.environments, ['Environment', 'Acts', 'Rule'], [
      (v) => `<span class="nm">${esc(v.name)}</span>`,
      (v) => `<span class="mono">${v.acts.join('')}</span>`,
      (v) => esc(v.text),
    ]),

    ENEMIES: table(enemies, ['Enemy', 'Act', 'Tier', 'Hull', 'Moves'], [
      (e) => `<span class="nm">${esc(e.name)}</span>`,
      (e) => `<span class="mono">${e.act}</span>`,
      (e) => `<span class="tag tag--${e.tier}">${e.tier}</span>`,
      (e) => `<span class="mono">${e.hull}</span>`,
      (e) => esc(e.moves.map((move) => move.label).join(', ')),
    ]),

    ENCOUNTERS: table(encounters, ['Encounter', 'Act', 'Tier', 'From row', 'Board'], [
      (e) => `<span class="nm">${esc(e.name)}</span>${e.tutorial ? ' <span class="tag">tutorial</span>' : ''}`,
      (e) => `<span class="mono">${e.act}</span>`,
      (e) => `<span class="tag tag--${e.tier}">${e.tier}</span>`,
      (e) => `<span class="mono">${e.minRow === null || e.minRow === 0 ? '&mdash;' : e.minRow}</span>`,
      (e) => esc(e.enemyIds.map((id) => names.get(id) ?? id).join(' + ')),
    ]),

    MASTERIES: table(pools.masteries, ['Mastery', 'Stance', 'Effect'], [
      (m) => `<span class="nm">${esc(m.name)}</span>`,
      (m) => `<span class="tag tag--${m.stance}">${m.stance}</span>`,
      (m) => esc(m.text),
    ]),

    STATUSES: table(pools.statuses, ['Status', 'Kind', 'Rule'], [
      (s) => `<span class="nm">${esc(s.name)}</span>`,
      (s) => `<span class="tag">${esc(s.kind)}</span>`,
      (s) => esc(s.text),
    ]),

    KEYWORDS: table(pools.keywords, ['Keyword', 'Rule'], [
      (k) => `<span class="nm">${esc(k.name)}</span>`,
      (k) => esc(k.text),
    ]),

    NCARDS: pools.cards.length,
    NRELICS: pools.relics.length,
    NIMPLANTS: pools.implants.length,
    NENEMIES: pools.enemies.length,
    NENCOUNTERS: pools.encounters.length,
    NENVS: pools.environments.length,
    RARITYMIX: mix(pools.cards.map((c) => c.rarity), [
      'basic', 'common', 'uncommon', 'epic', 'legendary', 'mythic', 'artifact',
    ]),
    TYPEMIX: mix(pools.cards.map((c) => c.type)),
  });
}
