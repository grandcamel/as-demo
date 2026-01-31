/**
 * Vitest setup file
 *
 * Provides Jest compatibility by aliasing vi to jest.
 * This allows existing tests to work without modification.
 */
import { vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Clear the Node.js require cache for project modules.
 * This is necessary because Vitest's vi.resetModules() doesn't
 * clear the CommonJS require cache the same way Jest does.
 */
function clearRequireCache() {
  const projectRoot = process.cwd();
  Object.keys(require.cache).forEach((key) => {
    // Only clear project modules, not node_modules
    if (key.startsWith(projectRoot) && !key.includes('node_modules')) {
      delete require.cache[key];
    }
  });
}

// Reset modules before each test to ensure clean state
// This is critical for tests that manipulate process.env and use require()
beforeEach(() => {
  vi.resetModules();
  clearRequireCache();
});

// Custom resetModules that also clears require cache
const resetModulesWithCache = () => {
  vi.resetModules();
  clearRequireCache();
};

// Make vi available as jest for compatibility with existing tests
// This includes all common Jest methods that tests might use
globalThis.jest = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  mock: vi.mock,
  unmock: vi.unmock,
  doMock: vi.doMock,
  doUnmock: vi.doUnmock,
  resetModules: resetModulesWithCache,
  resetAllMocks: vi.resetAllMocks,
  clearAllMocks: vi.clearAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  useFakeTimers: vi.useFakeTimers,
  useRealTimers: vi.useRealTimers,
  advanceTimersByTime: vi.advanceTimersByTime,
  runAllTimers: vi.runAllTimers,
  setSystemTime: vi.setSystemTime,
  getMockName: vi.getMockName,
  isMockFunction: vi.isMockFunction,
};
