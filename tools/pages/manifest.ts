/* The Manifest — every card, relic, implant and enemy in one table.
 *
 * Nothing here is written by hand. The rules text comes from `describeCard`,
 * which is the same function that prints the text on the card in the game, so
 * the page cannot drift from the build the way a typed-up list does.
 */

import type { Pools } from '../dump.ts';
import { by, chip, esc, fill, rank, table, tierRank } from './html.ts';

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
