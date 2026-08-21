/* The guard tests.
 *
 * These encode CLAUDE.md so nobody has to remember it. They are greps, and
 * that is on purpose: a type system cannot stop someone reaching for
 * `Date.now()` inside the engine, and a code review will miss it on the day it
 * matters.
 *
 * If one of these ever fails, the design is wrong, not the test.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, extensions));
      continue;
    }
    if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly pattern: string;
}

function grep(files: readonly string[], patterns: readonly RegExp[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          hits.push({
            file: relative(ROOT, file).replaceAll('\\', '/'),
            line: index + 1,
            text: text.trim(),
            pattern: pattern.source,
          });
        }
      }
    });
  }
  return hits;
}

function report(hits: readonly Hit[]): string {
  return hits.map((hit) => `${hit.file}:${hit.line}  /${hit.pattern}/  ${hit.text}`).join('\n');
}

describe('purity', () => {
  /* `src/engine/` and `src/content/` are pure: no DOM, no window, no clock, no
     unseeded randomness. Everything downstream — replay, the determinism
     harness, the simulator — depends on it. All randomness flows through the
     seeded streams in `engine/rng.ts` instead. */
  const PURE_DIRS = ['src/engine', 'src/content'];

  const FORBIDDEN = [
    /Math\.random/,
    /\bdocument\./,
    /\bwindow\./,
    /\bnavigator\./,
    /Date\.now/,
    /\bnew Date\b/,
    /performance\.now/,
    /\bsetTimeout\b/,
    /\bsetInterval\b/,
    /requestAnimationFrame/,
  ];

  for (const dir of PURE_DIRS) {
    it(`${dir}/ touches nothing impure`, () => {
      const files = walk(join(ROOT, dir), ['.ts']);
      expect(files.length).toBeGreaterThan(0);
      const hits = grep(files, FORBIDDEN);
      expect(report(hits)).toBe('');
    });
  }
});

describe('no persistence', () => {
  /* No saves. None. Close the tab and the run is gone — a deliberate product
     decision, not an oversight. There is a `beforeunload` guard during a live
     run and a visible, copyable seed, and that is the whole mitigation.

     `fetch(` is on the list for the same reason: no network calls means no
     analytics, no scores, and no accounts by the back door. */
  const FORBIDDEN = [
    /localStorage/,
    /sessionStorage/,
    /document\.cookie/,
    /indexedDB/,
    /\bfetch\(/,
    /XMLHttpRequest/,
    /navigator\.sendBeacon/,
  ];

  it('src/ stores nothing, anywhere', () => {
    const files = walk(join(ROOT, 'src'), ['.ts', '.css']);
    expect(files.length).toBeGreaterThan(0);
    const hits = grep(files, FORBIDDEN);
    expect(report(hits)).toBe('');
  });

  it('index.html stores nothing either', () => {
    const hits = grep([join(ROOT, 'index.html')], FORBIDDEN);
    expect(report(hits)).toBe('');
  });
});

describe('the shipped bundle', () => {
  /* The greps above read the source. This one reads what actually goes on the
     wire, because the two are not the same file and the difference is where a
     network call got in.

     It caught exactly that at M8: Vite's modulepreload polyfill puts a
     `fetch()` in the bundle to warm preload links. Nothing here is code-split,
     so it never ran — but "no network calls" is a promise about the artifact,
     not about the source tree, and a guard that only reads `src/` cannot keep
     it. The polyfill is off in `vite.config.ts`; this is what notices if it
     ever comes back.

     Skipped without a build rather than failing: a fresh clone has no `dist/`
     and that is not a defect. Vitest prints the skip, so it stays visible. */
  const DIST = join(ROOT, 'dist');
  const built = existsSync(DIST);

  describe.skipIf(!built)('dist/ (run `npm run build` first)', () => {
    it('ships no network call and no storage', () => {
      const files = walk(DIST, ['.js', '.css', '.html']);
      expect(files.length).toBeGreaterThan(0);
      const hits = grep(files, [
        /localStorage/,
        /sessionStorage/,
        /document\.cookie/,
        /indexedDB/,
        /\bfetch\(/,
        /XMLHttpRequest/,
        /navigator\.sendBeacon/,
        /new WebSocket/,
      ]);
      /* Minified output is one enormous line, so a hit's `text` would be the
         whole bundle. The file and the pattern are the useful part. */
      expect(hits.map((hit) => `${hit.file}  /${hit.pattern}/`).join('\n')).toBe('');
    });

    it('asks for nothing off the machine', () => {
      const files = walk(DIST, ['.js', '.css', '.html']);
      const hits = grep(files, [/https?:\/\/(?!www\.w3\.org)/]);
      expect(hits.map((hit) => `${hit.file}  /${hit.pattern}/`).join('\n')).toBe('');
    });
  });
});

describe('no dialogs', () => {
  /* `alert`, `confirm` and `prompt` block the whole tab, cannot be styled, and
     on mobile can be suppressed entirely. In-page dialogs only. */
  it('src/ uses in-page dialogs only', () => {
    const files = walk(join(ROOT, 'src'), ['.ts']);
    const hits = grep(files, [/\balert\(/, /\bconfirm\(/, /(?<!\.)\bprompt\(/]);
    expect(report(hits)).toBe('');
  });
});

describe('no web fonts', () => {
  /* System font stack, no CDN. The only lettering that must look identical
     everywhere is the wordmark, and that is hand-plotted SVG. */
  it('stylesheets pull nothing remote', () => {
    const files = walk(join(ROOT, 'src/styles'), ['.css']);
    const hits = grep(files, [/@import/, /@font-face/, /url\(\s*['"]?https?:/]);
    expect(report(hits)).toBe('');
  });

  it('index.html pulls nothing remote', () => {
    const hits = grep([join(ROOT, 'index.html')], [/https?:\/\/(?!www\.w3\.org)/]);
    expect(report(hits)).toBe('');
  });
});
