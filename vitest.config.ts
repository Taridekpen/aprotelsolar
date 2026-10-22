import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 180_000,
    testTimeout: 40_000,
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/env.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@aprotel/shared': path.join(root, 'packages/shared/src/index.ts'),
      '@aprotel/solar-engine': path.join(root, 'packages/solar-engine/src/index.ts'),
    },
  },
});
