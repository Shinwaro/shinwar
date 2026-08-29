/* The front door — a local index linking the three reference pages.
 *
 * It exists because there was no easy way to GET to them. Bookmark this one
 * file and the three are always one click away, always rebuilt from the
 * working tree rather than from whatever was last published.
 */

import type { Pools } from '../dump.ts';
import { esc, fill } from './html.ts';

export type PageLink = {
  readonly file: string;
  readonly name: string;
  readonly what: string;
  readonly url: string;
  readonly count: (pools: Pools) => string;
};

export function buildIndex(pools: Pools, template: string, pages: readonly PageLink[]): string {
  const cards = pages
    .map(
      (page) =>
        `<a class="page" href="./${page.file}">` +
        `<span class="page-name">${esc(page.name)}` +
        `<span class="page-n">${esc(page.count(pools))}</span></span>` +
        `<span class="page-what">${esc(page.what)}</span></a>`,
    )
    .join('');

  const shared = pages
    .map((page) => `<a href="${page.url}">${esc(page.name)}</a>`)
    .join('');

  /* The LOCAL date, not UTC. This line exists to answer "is this current", and
     a build run in the evening west of Greenwich stamping yesterday is the one
     answer it must never give. Date only — a timestamp to the second would
     make every rebuild a diff for no one's benefit. */
  const now = new Date();
  const built = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return fill(template, { PAGES: cards, SHARED: shared, BUILT: built });
}
