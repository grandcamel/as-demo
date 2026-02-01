# Testing Guide

This document covers the testing infrastructure for AS-Demo, including how to run tests, add new tests, and debug failures.

## Test Suites Overview

| Suite | Location | Purpose | How to Run |
|-------|----------|---------|------------|
| Unit Tests | `queue-manager/__tests__/**/*.test.js` | Test individual modules | `npm test` |
| Integration Tests | `queue-manager/__tests__/integration/*.test.js` | Test module interactions | `npm test` |
| Skill Tests | `demo-container/skill-test.py` | Test Claude Code skills | `make test-skill` |
| Validation Suite | `scripts/validate/*` | Validate configs and security | `make validate` |

## Unit Tests

### Running Tests

```bash
cd queue-manager

# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Coverage Thresholds

Global thresholds (enforced by CI):
- Lines: 60%
- Functions: 60%
- Branches: 50%
- Statements: 60%

Per-file thresholds for critical utilities (100%):
- `lib/rate-limit.js`
- `lib/env-file.js`
- `config/platforms/*.js`
- `services/state.js`
- `services/queue.js`

### Adding Unit Tests

1. Create test file alongside source:
   ```
   services/queue.js       # Source
   __tests__/services/queue.test.js  # Test
   ```

2. Use the mock infrastructure:
   ```javascript
   const { createMockRedis, createClient, createConfig } = require('../mocks');

   describe('Queue Service', () => {
     let redis;

     beforeEach(() => {
       redis = createMockRedis();
     });

     afterEach(() => {
       redis.clear();
     });

     it('should add client to queue', async () => {
       // Test implementation
     });
   });
   ```

3. For dependency injection tests:
   ```javascript
   const { createDefaultDeps, startSession } = require('../../services/session');

   it('should start session with mock deps', async () => {
     const deps = {
       ...createDefaultDeps(),
       spawn: vi.fn(() => mockProcess),
       config: createConfig({ SESSION_TIMEOUT_MINUTES: 5 }),
     };

     await startSession(redis, ws, client, processQueue, deps);
   });
   ```

## Integration Tests

Integration tests verify module interactions without external services.

### Available Test Files

- `websocket-lifecycle.test.js` - Connection, queue, session lifecycle
- `queue-processing.test.js` - Multi-client queue scenarios
- `invite-flow.test.js` - Invite token creation, validation, redemption

### Running Integration Tests

```bash
# Run all tests (including integration)
npm test

# Run only integration tests
npm test -- --dir __tests__/integration
```

## Skill Tests

Skill tests validate Claude Code skills using an LLM-as-judge approach.

### Running Skill Tests

```bash
# Single platform/scenario
make test-skill PLATFORM=confluence SCENARIO=page

# With specific model
make test-skill PLATFORM=confluence SCENARIO=page MODEL=claude-sonnet-4-20250514

# All scenarios for a platform
make test-confluence

# All platforms
make test-all

# Mock mode (no real API calls)
make test-skill-mock PLATFORM=confluence SCENARIO=page
```

### Skill Test Output

Tests compare expected tool calls against actual execution:

```
Testing: confluence/page
Expected tools: confluence_create_page, confluence_update_page
Actual tools: confluence_create_page, confluence_update_page
Result: PASS
```

### Iterative Refinement

For failing tests, use the refinement loop:

```bash
make refine-skill PLATFORM=confluence SCENARIO=page MAX_ATTEMPTS=3

# With mock mode
make refine-skill PLATFORM=confluence SCENARIO=page MOCK=true
```

This runs the test, analyzes failures, and suggests improvements.

## Validation Suite

### Running Validations

```bash
# All validations
make validate

# Individual validations
make validate-compose      # Docker Compose syntax
make validate-volumes      # Volume mounts
make validate-ports        # Port conflicts
make validate-health       # Health endpoints
make validate-integration  # WebSocket/Redis
make validate-scenarios    # Scenario files
make validate-env          # Environment variables
make validate-security     # Security scan
make validate-secrets      # Credential leaks
```

### Adding Validation Checks

Add scripts to `scripts/validate/`:

```bash
#!/bin/bash
# scripts/validate/my-check.sh

set -e

echo "Running my validation..."

# Check logic here
if [ some_condition ]; then
  echo "PASS: My check passed"
  exit 0
else
  echo "FAIL: My check failed"
  exit 1
fi
```

## Mock Infrastructure

### Available Mocks

Located in `queue-manager/__tests__/mocks/`:

| Mock | Purpose |
|------|---------|
| `MockRedis` | In-memory Redis operations |
| `MockWebSocket` | WebSocket connection simulation |
| `fixtures.js` | Test data builders |

### Using Mock Redis

```javascript
const { createMockRedis } = require('../mocks');

const redis = createMockRedis();

await redis.set('key', 'value');
await redis.get('key');  // 'value'

// Verify calls
redis.getCalls();        // All recorded calls
redis.getCallsFor('set'); // Only 'set' calls
```

### Using Mock WebSocket

```javascript
const { createMockWsClient } = require('../mocks');

const ws = createMockWsClient();

ws.send(JSON.stringify({ type: 'welcome' }));

// Verify messages
ws.getSentMessages();     // All sent messages
ws.getLastMessage();      // Last message
ws.getMessagesByType('welcome'); // Filter by type
```

### Using Fixtures

```javascript
const { createClient, createSession, createConfig } = require('../mocks');

const client = createClient({
  id: 'test-client',
  state: 'connected',
});

const session = createSession({
  clientId: client.id,
  timeoutMinutes: 30,
});

const config = createConfig({
  ENABLED_PLATFORMS: ['confluence'],
});
```

## Debugging Test Failures

### Common Issues

**1. Environment Variable Leakage**

Tests manipulating `process.env` can affect other tests.

Solution: Use `singleFork: true` in vitest config (already configured).

**2. Mock State Not Reset**

Mocks accumulating state between tests.

Solution: Call `redis.clear()` and `vi.clearAllMocks()` in `afterEach`.

**3. Async Timing Issues**

Tests completing before async operations finish.

Solution: Always `await` async operations, use `vi.useFakeTimers()` for timeouts.

### Debugging Techniques

```javascript
// Log all calls to a mock
console.log(redis.getCalls());

// Inspect WebSocket messages
console.log(JSON.stringify(ws.getSentMessages(), null, 2));

// Check mock function calls
expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
  clientId: 'expected-id',
}));
```

### Running Single Test

```bash
# Run specific test file
npm test -- queue.test.js

# Run specific test
npm test -- -t "should add client to queue"

# Run with verbose output
npm test -- --reporter=verbose
```

## CI/CD Integration

Tests run automatically in GitHub Actions:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci
        working-directory: queue-manager
      - name: Run tests
        run: npm run test:coverage
        working-directory: queue-manager
      - name: Check coverage thresholds
        run: npm run test:coverage -- --coverage.thresholds.100
        working-directory: queue-manager
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Use descriptive test names** - `it('should reject expired invite tokens')`
3. **One assertion per test** - Makes failures easier to diagnose
4. **Use fixtures for test data** - Consistent, reusable test objects
5. **Clean up after tests** - Reset mocks and state in `afterEach`
6. **Test edge cases** - Empty arrays, null values, error conditions
