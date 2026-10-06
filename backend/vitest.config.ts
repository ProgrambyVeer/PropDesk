import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globalSetup: './tests/global-setup.ts', fileParallelism: false, testTimeout: 30000, hookTimeout: 120000, env: { NODE_ENV: 'test' } },
});
