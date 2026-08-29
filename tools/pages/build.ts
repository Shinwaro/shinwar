/* Rebuild all three reference pages. `npm run pages`.
 *
 * One command, no build order, no intermediate files to regenerate first: the
 * content pools are built in memory by `tools/dump.ts` and handed straight to
 * the three page builders. Output lands in `tools/out/pages/`, which is
 * gitignored — the pages are derived, and a derived file in the diff is a
 * derived file that will be stale.
 *
 * The published copies live as Artifacts. `PAGES.md` has the three URLs and
 * they are the same URLs every time, so republishing updates the page in place
 * rather than scattering copies.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPools } from '../dump.ts';
import { buildAnomalies } from './anomalies.ts';
import { buildBestiary } from './bestiary.ts';
import { buildManifest } from './manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const templates = join(here, 'templates');
const out = join(here, '..', 'out', 'pages');

const pools = buildPools();
mkdirSync(out, { recursive: true });

const pages = [
  { file: 'manifest.html', build: buildManifest },
  { file: 'bestiary.html', build: buildBestiary },
  { file: 'anomalies.html', build: buildAnomalies },
] as const;

for (const page of pages) {
  const template = readFileSync(join(templates, page.file), 'utf8');
  const html = page.build(pools, template);
  writeFileSync(join(out, page.file), html, 'utf8');
  process.stdout.write(`tools/out/pages/${page.file} — ${html.length} bytes\n`);
}
