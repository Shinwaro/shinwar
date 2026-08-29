/* Rebuild all three reference pages. `npm run pages`.
 *
 * One command, no build order, no intermediate files to regenerate first: the
 * content pools are built in memory by `tools/dump.ts` and handed straight to
 * the three page builders. Output lands in `tools/out/pages/`, which is
 * gitignored — the pages are derived, and a derived file in the diff is a
 * derived file that will be stale.
 *
 * `index.html` is the front door: open it from disk and the three are one
 * click away, always rebuilt from the working tree. The published copies live
 * as Artifacts — `PAGES.md` has the three URLs, and they are the same URLs
 * every time, so republishing updates a page in place rather than scattering
 * copies.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Pools } from '../dump.ts';
import { buildPools } from '../dump.ts';
import { buildAnomalies } from './anomalies.ts';
import { buildBestiary } from './bestiary.ts';
import { buildIndex, type PageLink } from './index.ts';
import { buildManifest } from './manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const templates = join(here, 'templates');
const out = join(here, '..', 'out', 'pages');

/* The URLs are duplicated from PAGES.md on purpose. That file is for a person
   deciding where to publish; this list is what the index links to. A build
   that silently parsed a Markdown table would break the first time someone
   tidied it. */
const pages: readonly (PageLink & {
  readonly build: (pools: Pools, template: string) => string;
})[] = [
  {
    file: 'manifest.html',
    name: 'Manifest',
    what: 'Every card, relic, implant, mastery, status and keyword',
    url: 'https://claude.ai/code/artifact/e427de99-9f77-47be-b993-ab4f572ca6f1',
    count: (p) => `${p.cards.length} cards · ${p.relics.length} relics · ${p.implants.length} implants`,
    build: buildManifest,
  },
  {
    file: 'bestiary.html',
    name: 'Bestiary',
    what: 'Every enemy and encounter by act, with hull and damage a turn',
    url: 'https://claude.ai/code/artifact/164b0a88-3e7b-4360-a7f7-b1ff7c9bec8e',
    count: (p) => `${p.enemies.length} enemies · ${p.encounters.length} encounters`,
    build: buildBestiary,
  },
  {
    file: 'anomalies.html',
    name: 'Anomaly Ledger',
    what: 'Every event, every option, and the alloy-for-health economy',
    url: 'https://claude.ai/code/artifact/2aaf1a36-986e-4509-95e4-5b89b84761fb',
    count: (p) => `${p.events.length} events · ${p.threads.length} threads`,
    build: buildAnomalies,
  },
];

const pools = buildPools();
mkdirSync(out, { recursive: true });

for (const page of pages) {
  const template = readFileSync(join(templates, page.file), 'utf8');
  const html = page.build(pools, template);
  writeFileSync(join(out, page.file), html, 'utf8');
  process.stdout.write(`  ${page.file.padEnd(16)} ${String(html.length).padStart(7)} bytes\n`);
}

const index = buildIndex(pools, readFileSync(join(templates, 'index.html'), 'utf8'), pages);
writeFileSync(join(out, 'index.html'), index, 'utf8');

/* A file:// URL, because the whole point of the index is that it is one click
   from here. Most terminals make it clickable. */
process.stdout.write(`
Open: ${pathToFileURL(join(out, 'index.html')).href}
`);
