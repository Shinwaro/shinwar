import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so dist/ also works when opened from a file:// path
  // or served from somewhere other than the domain root.
  base: './',
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
