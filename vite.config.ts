import { defineConfig } from 'vitest/config';

/* The port a preview should bind, when something else has already chosen one.
 *
 * `vite preview` does not read `PORT`; left alone it takes 4173, and if that is
 * busy it silently increments and reports the new one only in its own output.
 * That is fine for a person reading a terminal and useless to a tool that was
 * told which port to expect — it opens the assigned one and gets nothing.
 *
 * Reading the environment here is the whole fix, and it belongs here rather
 * than in a script flag: this is build tooling, it never ships, and `src/`
 * stays as pure as the guards demand. */
const previewPort = Number(process.env['PORT']) || 4173;

export default defineConfig({
  // Relative asset paths, so dist/ also works when opened from a file:// path
  // or served from somewhere other than the domain root.
  base: './',
  preview: { port: previewPort },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // One page, one bundle. Nothing here is big enough to be worth splitting,
    // and a single request is the fastest a title screen can be.
    assetsInlineLimit: 4096,
    reportCompressedSize: true,
    /* Off, and this one matters more than it looks.
     *
     * Vite otherwise injects a helper that `fetch()`es preload links for
     * browsers without `modulepreload`. There is one bundle here and nothing to
     * preload, so it never fires — but it puts a live `fetch(` in the shipped
     * artifact of a game whose entire premise is that it never talks to
     * anything. The source guard test greps `src/`, so it cannot see a call the
     * bundler wrote. There is a guard over `dist/` now as well. */
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
