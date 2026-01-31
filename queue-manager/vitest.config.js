import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.js'],
    setupFiles: ['./__tests__/setup.js'],
    // Run tests sequentially to avoid process.env state leakage
    // between tests that manipulate environment variables
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules/', '__tests__/', 'coverage/', '*.config.js'],
      // Disable thresholds until tests are fully migrated
      // thresholds: {
      //   './lib/': {
      //     branches: 90,
      //     functions: 95,
      //     lines: 95,
      //     statements: 95,
      //   },
      //   global: {
      //     branches: 70,
      //     functions: 70,
      //     lines: 70,
      //     statements: 70,
      //   },
      // },
    },
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    globals: true,
    // Reset module registry before each test file
    isolate: true,
    // Ensure fresh module state between tests
    sequence: {
      shuffle: false,
    },
  },
});
