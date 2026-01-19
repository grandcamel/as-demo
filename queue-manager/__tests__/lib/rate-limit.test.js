/**
 * Tests for lib/rate-limit.js
 *
 * Tests rate limiting logic with time mocking.
 */

const {
  createRateLimiter,
  createConnectionRateLimiter,
  createInviteRateLimiter
} = require('../../lib/rate-limit');

describe('rate-limit', () => {
  let originalDateNow;

  beforeEach(() => {
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('createRateLimiter', () => {
    describe('validation', () => {
      it('should throw error for missing windowMs', () => {
        expect(() => createRateLimiter({ maxAttempts: 10 }))
          .toThrow('windowMs must be a positive number');
      });

      it('should throw error for zero windowMs', () => {
        expect(() => createRateLimiter({ windowMs: 0, maxAttempts: 10 }))
          .toThrow('windowMs must be a positive number');
      });

      it('should throw error for negative windowMs', () => {
        expect(() => createRateLimiter({ windowMs: -1000, maxAttempts: 10 }))
          .toThrow('windowMs must be a positive number');
      });

      it('should throw error for missing maxAttempts', () => {
        expect(() => createRateLimiter({ windowMs: 60000 }))
          .toThrow('maxAttempts must be a positive number');
      });

      it('should throw error for zero maxAttempts', () => {
        expect(() => createRateLimiter({ windowMs: 60000, maxAttempts: 0 }))
          .toThrow('maxAttempts must be a positive number');
      });

      it('should throw error for negative maxAttempts', () => {
        expect(() => createRateLimiter({ windowMs: 60000, maxAttempts: -5 }))
          .toThrow('maxAttempts must be a positive number');
      });

      it('should create limiter with valid options', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 10
        });

        expect(limiter).toHaveProperty('check');
        expect(limiter).toHaveProperty('recordFailure');
        expect(limiter).toHaveProperty('cleanup');
        expect(limiter).toHaveProperty('reset');
        expect(limiter).toHaveProperty('size');
      });

      it('should accept custom cleanupThreshold', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 10,
          cleanupThreshold: 500
        });

        expect(limiter).toBeDefined();
      });
    });

    describe('check', () => {
      it('should allow first attempt', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        const result = limiter.check('192.168.1.1');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
      });

      it('should decrement remaining on each attempt', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        expect(limiter.check('ip1').remaining).toBe(2);
        expect(limiter.check('ip1').remaining).toBe(1);
        expect(limiter.check('ip1').remaining).toBe(0);
      });

      it('should block after max attempts reached', () => {
        const now = 1000000;
        Date.now = jest.fn(() => now);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1'); // 1
        limiter.check('ip1'); // 2
        limiter.check('ip1'); // 3

        const result = limiter.check('ip1'); // should be blocked

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBe(60);
      });

      it('should calculate correct retryAfter when partially through window', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 2
        });

        limiter.check('ip1');
        limiter.check('ip1');

        // Advance time by 30 seconds
        currentTime += 30000;

        const result = limiter.check('ip1');

        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBe(30); // 30 seconds remaining
      });

      it('should not increment when increment=false', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1', false); // peek, don't increment
        limiter.check('ip1', false); // peek, don't increment

        const result = limiter.check('ip1', true); // now increment

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
      });

      it('should track different keys independently', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 2
        });

        limiter.check('ip1');
        limiter.check('ip1');

        const ip1Result = limiter.check('ip1');
        const ip2Result = limiter.check('ip2');

        expect(ip1Result.allowed).toBe(false);
        expect(ip2Result.allowed).toBe(true);
        expect(ip2Result.remaining).toBe(1);
      });

      it('should reset after window expires', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 2
        });

        limiter.check('ip1');
        limiter.check('ip1');

        expect(limiter.check('ip1').allowed).toBe(false);

        // Advance time past window
        currentTime += 60001;

        const result = limiter.check('ip1');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1);
      });

      it('should clean up old entry when window expires', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1');
        expect(limiter.size()).toBe(1);

        // Advance time past window
        currentTime += 60001;

        limiter.check('ip1'); // This should trigger cleanup of old entry

        expect(limiter.size()).toBe(1); // Still 1, but it's a new entry
      });
    });

    describe('recordFailure', () => {
      it('should record failure for new key', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.recordFailure('ip1');

        const result = limiter.check('ip1');
        expect(result.remaining).toBe(1); // 3 - 1 (recorded) - 1 (check) = 1
      });

      it('should increment existing record', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.recordFailure('ip1');
        limiter.recordFailure('ip1');
        limiter.recordFailure('ip1');

        const result = limiter.check('ip1');
        expect(result.allowed).toBe(false);
      });

      it('should reset expired record before recording', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.recordFailure('ip1');
        limiter.recordFailure('ip1');

        // Advance past window
        currentTime += 60001;

        limiter.recordFailure('ip1');

        const result = limiter.check('ip1');
        expect(result.remaining).toBe(1); // Fresh window: 3 - 1 (record) - 1 (check) = 1
      });
    });

    describe('cleanup', () => {
      it('should remove expired entries', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1');
        limiter.check('ip2');
        limiter.check('ip3');

        expect(limiter.size()).toBe(3);

        // Advance past window
        currentTime += 60001;

        limiter.cleanup();

        expect(limiter.size()).toBe(0);
      });

      it('should keep non-expired entries', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1');

        // Advance time but not past window
        currentTime += 30000;

        limiter.check('ip2');

        // Advance past ip1's window but not ip2's
        currentTime += 35000;

        limiter.cleanup();

        expect(limiter.size()).toBe(1);
      });

      it('should trigger automatic cleanup when threshold exceeded', () => {
        let currentTime = 1000000;
        Date.now = jest.fn(() => currentTime);

        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3,
          cleanupThreshold: 5
        });

        // Add entries
        for (let i = 0; i < 6; i++) {
          limiter.check(`ip${i}`);
        }

        expect(limiter.size()).toBe(6);

        // Advance time past window
        currentTime += 60001;

        // This check should trigger cleanup due to threshold
        limiter.check('ip-new');

        // All old entries should be cleaned, only new one remains
        expect(limiter.size()).toBe(1);
      });
    });

    describe('reset', () => {
      it('should reset specific key', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 2
        });

        limiter.check('ip1');
        limiter.check('ip1');

        expect(limiter.check('ip1').allowed).toBe(false);

        limiter.reset('ip1');

        const result = limiter.check('ip1');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1);
      });

      it('should not affect other keys', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1');
        limiter.check('ip2');

        limiter.reset('ip1');

        expect(limiter.size()).toBe(1);
      });

      it('should handle resetting non-existent key', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        expect(() => limiter.reset('non-existent')).not.toThrow();
      });
    });

    describe('size', () => {
      it('should return 0 for empty limiter', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        expect(limiter.size()).toBe(0);
      });

      it('should return correct count', () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          maxAttempts: 3
        });

        limiter.check('ip1');
        limiter.check('ip2');
        limiter.check('ip3');

        expect(limiter.size()).toBe(3);
      });
    });
  });

  describe('createConnectionRateLimiter', () => {
    it('should create limiter with default options', () => {
      const limiter = createConnectionRateLimiter();

      expect(limiter).toHaveProperty('check');
      expect(limiter).toHaveProperty('reset');
    });

    it('should use default window of 1 minute', () => {
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const limiter = createConnectionRateLimiter();

      // Exhaust attempts
      for (let i = 0; i < 10; i++) {
        limiter.check('ip1');
      }

      const blocked = limiter.check('ip1');
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBe(60);
    });

    it('should use default max connections of 10', () => {
      const limiter = createConnectionRateLimiter();

      for (let i = 0; i < 10; i++) {
        expect(limiter.check('ip1').allowed).toBe(true);
      }

      expect(limiter.check('ip1').allowed).toBe(false);
    });

    it('should accept custom windowMs', () => {
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const limiter = createConnectionRateLimiter({ windowMs: 30000 });

      for (let i = 0; i < 10; i++) {
        limiter.check('ip1');
      }

      const blocked = limiter.check('ip1');
      expect(blocked.retryAfter).toBe(30);
    });

    it('should accept custom maxConnections', () => {
      const limiter = createConnectionRateLimiter({ maxConnections: 5 });

      for (let i = 0; i < 5; i++) {
        expect(limiter.check('ip1').allowed).toBe(true);
      }

      expect(limiter.check('ip1').allowed).toBe(false);
    });
  });

  describe('createInviteRateLimiter', () => {
    it('should create limiter with default options', () => {
      const limiter = createInviteRateLimiter();

      expect(limiter).toHaveProperty('check');
      expect(limiter).toHaveProperty('recordFailure');
    });

    it('should use default window of 1 hour', () => {
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const limiter = createInviteRateLimiter();

      for (let i = 0; i < 10; i++) {
        limiter.check('ip1');
      }

      const blocked = limiter.check('ip1');
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBe(3600);
    });

    it('should use default max attempts of 10', () => {
      const limiter = createInviteRateLimiter();

      for (let i = 0; i < 10; i++) {
        expect(limiter.check('ip1').allowed).toBe(true);
      }

      expect(limiter.check('ip1').allowed).toBe(false);
    });

    it('should accept custom windowMs', () => {
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const limiter = createInviteRateLimiter({ windowMs: 1800000 }); // 30 min

      for (let i = 0; i < 10; i++) {
        limiter.check('ip1');
      }

      const blocked = limiter.check('ip1');
      expect(blocked.retryAfter).toBe(1800);
    });

    it('should accept custom maxAttempts', () => {
      const limiter = createInviteRateLimiter({ maxAttempts: 3 });

      for (let i = 0; i < 3; i++) {
        expect(limiter.check('ip1').allowed).toBe(true);
      }

      expect(limiter.check('ip1').allowed).toBe(false);
    });
  });
});
