/* The Bestiary — everything the game can put in front of you, by act.
 *
 * The two figures that matter for a balance read are hull and damage a turn,
 * and neither is typed by hand: `damagePerTurn` is averaged from the enemy's
 * own telegraphs in `tools/dump.ts`, so it moves the moment a move does.
 */

import type { Pools } from '../dump.ts';
import { by, esc, fill, tierRank } from './html.ts';

const ACTS = [1, 2, 3] as const;

export function buildBestiary(pools: Pools, template: string): string {
  const enemies = new Map(pools.enemies.map((enemy) => [enemy.id, enemy]));

  const beasts = ACTS.map((act) => {
    const rows = pools.enemies
      .filter((enemy) => enemy.act === act)
      .sort(by((e) => tierRank(e.tier), (e) => -e.hull));
    const items = rows
      .map((enemy) => {
        const moves = enemy.moves
          .map(
            (move) =>
              `<li><span class="mv-name">${esc(move.label)}</span>` +
              `<span class="mv-int">${
                move.intent.map((hit) => esc(hit)).join(' &middot; ') || '&mdash;'
              }</span></li>`,
          )
          .join('');
        const flavor =
          enemy.flavor === null ? '' : `<p class="beast-flavor">${esc(enemy.flavor)}</p>`;
        return (
          `<article class="beast" data-tier="${enemy.tier}" data-act="${act}">` +
          `<header class="beast-head">` +
          `<h3>${esc(enemy.name)}</h3>` +
          `<span class="beast-tier" data-tier="${enemy.tier}">${enemy.tier}</span>` +
          `</header>` +
          `<div class="beast-stats">` +
          `<span><b>${enemy.hull}</b> hull</span>` +
          `<span><b>${enemy.damagePerTurn}</b> a turn</span>` +
          `<span class="script">${esc(enemy.script)}</span>` +
          `</div>` +
          `<ol class="moves">${moves}</ol>${flavor}</article>`
        );
      })
      .join('');
    return (
      `<section class="act"><h3 class="act-head">Act ${act}` +
      `<span class="act-n">${rows.length}</span></h3>` +
      `<div class="beasts">${items}</div></section>`
    );
  }).join('');

  const encounters = ACTS.map((act) => {
    const body = (['normal', 'elite', 'boss'] as const)
      .map((tier) => {
        const rows = pools.encounters
          .filter((e) => e.act === act && e.tier === tier && !e.tutorial)
          .sort(by((e) => e.hull));
        if (rows.length === 0) return '';
        const hulls = rows.map((row) => row.hull);
        const trs = rows
          .map((row) => {
            const board = row.enemyIds
              .map((id) => {
                const enemy = enemies.get(id);
                return `${esc(enemy?.name ?? id)} <span class='dim mono'>${enemy?.hull ?? 0}</span>`;
              })
              .join(' + ');
            return (
              `<tr>` +
              `<td class="nm">${esc(row.name)}</td>` +
              `<td class="mono">${row.hull}</td>` +
              `<td class="mono">${row.damagePerTurn}</td>` +
              `<td class="mono dim">${row.minRow === null || row.minRow === 0 ? '&mdash;' : row.minRow}</td>` +
              `<td>${board}</td>` +
              `</tr>`
            );
          })
          .join('');
        const spread =
          rows.length > 1
            ? `${Math.min(...hulls)}&ndash;${Math.max(...hulls)}`
            : String(hulls[0] ?? 0);
        return (
          `<h4 class="tier-head" data-tier="${tier}">${tier}` +
          `<span class="tier-n">${rows.length} &middot; ${spread} hull</span></h4>` +
          `<div class="scroll"><table>` +
          `<thead><tr><th>Encounter</th><th>Hull</th><th>Dmg/turn</th><th>From row</th><th>Board</th></tr></thead>` +
          `<tbody>${trs}</tbody></table></div>`
        );
      })
      .join('');
    return `<section class="act"><h3 class="act-head">Act ${act}</h3>${body}</section>`;
  }).join('');

  const environments = pools.environments
    .map(
      (env) =>
        `<article class="env" data-env="${esc(env.id)}">` +
        `<header class="env-head"><h3>${esc(env.name)}</h3>` +
        `<span class="env-acts mono">${env.acts.join('')}</span></header>` +
        `<p class="env-text">${esc(env.text)}</p></article>`,
    )
    .join('');

  return fill(template, {
    ENEMIES: beasts,
    ENCOUNTERS: encounters,
    ENVS: environments,
    NENEMIES: pools.enemies.length,
    NENC: pools.encounters.filter((e) => !e.tutorial).length,
    NENVS: pools.environments.length,
  });
}
