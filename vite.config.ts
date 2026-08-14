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
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
