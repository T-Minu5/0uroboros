/**
 * Bundles the game server into one file, `dist/server/main.mjs`, so the host needs only Node (>= 22.5 for node:sqlite)
 * and `ws`. The engine's extensionless imports and the workspace aliases are resolved here, not at runtime.
 */
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: [
    { find: /^@0uroboros\/engine\/(.*)$/, replacement: `${resolve('packages/engine/src')}/$1` },
    { find: /^@0uroboros\/content\/(.*)$/, replacement: `${resolve('packages/content')}/$1` },
    { find: /^@0uroboros\/protocol\/(.*)$/, replacement: `${resolve('packages/protocol/src')}/$1` },
    { find: /^@0uroboros\/server\/(.*)$/, replacement: `${resolve('packages/server/src')}/$1` },
  ] },
  build: {
    ssr: 'packages/server/src/main.ts',
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
    rollupOptions: { external: ['ws', 'zod', /^node:/], output: { entryFileNames: 'main.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
});
