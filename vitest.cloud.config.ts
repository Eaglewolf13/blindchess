import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/cloud-rules.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
