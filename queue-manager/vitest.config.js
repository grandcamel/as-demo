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
      thresholds: {
        // Per-file thresholds for well-tested utility code (100% coverage)
        'lib/rate-limit.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'lib/env-file.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'lib/session.js': { lines: 95, functions: 100, branches: 95, statements: 95 },

        // Config platforms are 100% covered
        'config/platforms/confluence.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'config/platforms/jira.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'config/platforms/splunk.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'config/cross-platform.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'config/metrics.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'config/schema.js': { lines: 95, functions: 50, branches: 100, statements: 95 },

        // Routes are well tested
        'routes/session.js': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'routes/scenarios.js': { lines: 100, functions: 100, branches: 90, statements: 100 },
        'routes/health.js': { lines: 85, functions: 100, branches: 100, statements: 85 },

        // Handlers have good coverage
        'handlers/websocket.js': { lines: 95, functions: 85, branches: 90, statements: 95 },

        // Services with tests
        'services/state.js': { lines: 100, functions: 100, branches: 100, statements: 100 },

        // Note: Global thresholds not set due to untested integration files
        // (instrumentation.js, server.js, lib/index.js, lib/metrics.js, services/invite|queue|session.js)
        // Add integration tests for these before enabling global thresholds
      },
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
