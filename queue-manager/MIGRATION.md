# Jest to Vitest Migration Notes

## Migration Status

The project has been migrated from Jest to Vitest. Most tests are passing, but some tests require additional updates to work with Vitest's mocking API.

### Passing Tests (177/295)

- `lib/rate-limit.test.js` - All passing
- `lib/session.test.js` - All passing
- `config/metrics.test.js` - All passing
- `config/cross-platform.test.js` - All passing
- `config/schema.test.js` - All passing (new)
- `routes/health.test.js` - All passing

### Tests Requiring Updates (118 failing)

The following test files use Jest mocking patterns that don't work identically in Vitest:

1. **`lib/env-file.test.js`** - Uses `jest.mock('fs')` for mocking the fs module
2. **`routes/session.test.js`** - Uses `jest.doMock()` for inline config mocking
3. **`routes/scenarios.test.js`** - Uses module mocking
4. **`handlers/websocket.test.js`** - Uses complex mocking
5. **`services/state.test.js`** - Uses module mocking
6. **`config/platforms/*.test.js`** - Process.env manipulation with require caching

## How to Fix

### Option 1: Update to Vitest Mocking API

Replace Jest mocking patterns with Vitest equivalents:

```javascript
// Before (Jest)
jest.mock('fs');
const fs = require('fs');
fs.readFileSync.mockReturnValue('...');

// After (Vitest)
import { vi } from 'vitest';
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '...'),
  writeFileSync: vi.fn(),
}));
```

### Option 2: Use Dynamic Imports

For tests that manipulate `process.env` and expect modules to re-read values:

```javascript
// Before (Jest)
jest.resetModules();
process.env.MY_VAR = 'test';
const config = require('./config');

// After (Vitest)
vi.resetModules();
process.env.MY_VAR = 'test';
const config = await import('./config');
```

### Option 3: Inline Mocking with vi.doMock

```javascript
// Before (Jest)
jest.doMock('./config', () => ({ value: 'mocked' }));

// After (Vitest)
vi.doMock('./config', () => ({ default: { value: 'mocked' } }));
const config = await import('./config');
```

## Key Differences

| Feature        | Jest                  | Vitest              |
| -------------- | --------------------- | ------------------- |
| Mock syntax    | `jest.mock()`         | `vi.mock()`         |
| Inline mock    | `jest.doMock()`       | `vi.doMock()`       |
| Reset modules  | `jest.resetModules()` | `vi.resetModules()` |
| Spy            | `jest.spyOn()`        | `vi.spyOn()`        |
| Module caching | Clears require.cache  | ESM-aware caching   |

## Running Tests

```bash
# Run all tests (some will fail until migration complete)
npm test

# Run only passing tests
npm test -- lib/rate-limit lib/session config/metrics config/cross-platform routes/health

# Watch mode
npm run test:watch
```

## Timeline

The migration can be completed incrementally. Priority order:

1. `config/platforms/*.test.js` - Simple env var tests
2. `lib/env-file.test.js` - fs mocking
3. `services/state.test.js` - State management
4. `routes/session.test.js` - Session handling
5. `handlers/websocket.test.js` - WebSocket tests
