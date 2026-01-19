/**
 * Rate limiting utilities for demo platform queue managers.
 *
 * Provides in-memory rate limiting with automatic cleanup.
 */

/**
 * Create a rate limiter instance.
 *
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxAttempts - Maximum attempts allowed per window
 * @param {number} [options.cleanupThreshold=1000] - Cleanup when map exceeds this size
 * @returns {Object} Rate limiter instance
 *
 * @example
 * const limiter = createRateLimiter({
 *   windowMs: 60 * 1000,  // 1 minute
 *   maxAttempts: 10
 * });
 *
 * const result = limiter.check('192.168.1.1');
 * if (!result.allowed) {
 *   console.log(`Rate limited. Retry after ${result.retryAfter} seconds`);
 * }
 */
function createRateLimiter(options) {
  const {
    windowMs,
    maxAttempts,
    cleanupThreshold = 1000
  } = options;

  if (!windowMs || windowMs <= 0) {
    throw new Error('windowMs must be a positive number');
  }
  if (!maxAttempts || maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive number');
  }

  // Map: key -> { count, resetAt }
  const records = new Map();

  /**
   * Check if an action is allowed for the given key.
   *
   * @param {string} key - Rate limit key (e.g., IP address)
   * @param {boolean} [increment=true] - Whether to increment the counter
   * @returns {Object} Rate limit check result
   * @returns {boolean} result.allowed - Whether the action is allowed
   * @returns {number} result.remaining - Remaining attempts in current window
   * @returns {number} [result.retryAfter] - Seconds until rate limit resets (if blocked)
   */
  function check(key, increment = true) {
    const now = Date.now();

    // Clean up expired entry
    const existing = records.get(key);
    if (existing && now > existing.resetAt) {
      records.delete(key);
    }

    // Periodic cleanup when map gets too large
    if (records.size > cleanupThreshold) {
      cleanup();
    }

    const record = records.get(key);

    if (!record) {
      if (increment) {
        records.set(key, { count: 1, resetAt: now + windowMs });
      }
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    if (record.count >= maxAttempts) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }

    if (increment) {
      record.count++;
    }

    return { allowed: true, remaining: maxAttempts - record.count };
  }

  /**
   * Record a failed attempt for the given key.
   * Useful for tracking failures separately from checks.
   *
   * @param {string} key - Rate limit key
   */
  function recordFailure(key) {
    const now = Date.now();
    const record = records.get(key);

    if (!record || now > record.resetAt) {
      records.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      record.count++;
    }
  }

  /**
   * Clean up expired rate limit entries.
   */
  function cleanup() {
    const now = Date.now();
    for (const [key, record] of records.entries()) {
      if (now > record.resetAt) {
        records.delete(key);
      }
    }
  }

  /**
   * Reset rate limit for a specific key.
   *
   * @param {string} key - Rate limit key to reset
   */
  function reset(key) {
    records.delete(key);
  }

  /**
   * Get the current number of tracked keys.
   *
   * @returns {number} Number of tracked keys
   */
  function size() {
    return records.size;
  }

  return {
    check,
    recordFailure,
    cleanup,
    reset,
    size
  };
}

/**
 * Create a connection rate limiter with sensible defaults.
 *
 * @param {Object} [options] - Override default options
 * @param {number} [options.windowMs=60000] - Time window (default: 1 minute)
 * @param {number} [options.maxConnections=10] - Max connections per window
 * @returns {Object} Rate limiter instance
 */
function createConnectionRateLimiter(options = {}) {
  return createRateLimiter({
    windowMs: options.windowMs || 60 * 1000,
    maxAttempts: options.maxConnections || 10,
    cleanupThreshold: options.cleanupThreshold || 1000
  });
}

/**
 * Create an invite brute-force protection rate limiter.
 *
 * @param {Object} [options] - Override default options
 * @param {number} [options.windowMs=3600000] - Time window (default: 1 hour)
 * @param {number} [options.maxAttempts=10] - Max failed attempts per window
 * @returns {Object} Rate limiter instance
 */
function createInviteRateLimiter(options = {}) {
  return createRateLimiter({
    windowMs: options.windowMs || 60 * 60 * 1000,
    maxAttempts: options.maxAttempts || 10,
    cleanupThreshold: options.cleanupThreshold || 500
  });
}

module.exports = {
  createRateLimiter,
  createConnectionRateLimiter,
  createInviteRateLimiter
};
