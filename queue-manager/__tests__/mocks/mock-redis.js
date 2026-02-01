/**
 * Mock Redis client for unit tests.
 *
 * Provides an in-memory implementation of Redis operations
 * used by the queue manager services.
 */

class MockRedis {
  constructor() {
    this.store = new Map();
    this.expirations = new Map();
    this.calls = [];
  }

  /**
   * Record a method call for verification.
   * @param {string} method - Method name
   * @param {Array} args - Method arguments
   */
  _recordCall(method, args) {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  /**
   * Get all recorded calls.
   * @returns {Array} Array of call records
   */
  getCalls() {
    return this.calls;
  }

  /**
   * Get calls for a specific method.
   * @param {string} method - Method name
   * @returns {Array} Array of call records for that method
   */
  getCallsFor(method) {
    return this.calls.filter((c) => c.method === method);
  }

  /**
   * Clear all recorded calls.
   */
  clearCalls() {
    this.calls = [];
  }

  /**
   * Clear all stored data.
   */
  clear() {
    this.store.clear();
    this.expirations.clear();
    this.calls = [];
  }

  /**
   * Get a value by key.
   * @param {string} key - Key to get
   * @returns {Promise<string|null>}
   */
  async get(key) {
    this._recordCall('get', [key]);
    return this.store.get(key) ?? null;
  }

  /**
   * Set a value with optional expiration.
   * @param {string} key - Key to set
   * @param {string} value - Value to store
   * @param {string} [exFlag] - 'EX' for expiration
   * @param {number} [exSeconds] - Expiration in seconds
   * @returns {Promise<string>} 'OK'
   */
  async set(key, value, exFlag, exSeconds) {
    this._recordCall('set', [key, value, exFlag, exSeconds]);
    this.store.set(key, value);
    if (exFlag === 'EX' && exSeconds) {
      this.expirations.set(key, Date.now() + exSeconds * 1000);
    }
    return 'OK';
  }

  /**
   * Delete a key.
   * @param {string} key - Key to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  async del(key) {
    this._recordCall('del', [key]);
    const existed = this.store.has(key);
    this.store.delete(key);
    this.expirations.delete(key);
    return existed ? 1 : 0;
  }

  /**
   * Check if a key exists.
   * @param {string} key - Key to check
   * @returns {Promise<number>} 1 if exists, 0 otherwise
   */
  async exists(key) {
    this._recordCall('exists', [key]);
    return this.store.has(key) ? 1 : 0;
  }

  /**
   * Set expiration on a key.
   * @param {string} key - Key to expire
   * @param {number} seconds - Expiration in seconds
   * @returns {Promise<number>} 1 if timeout was set, 0 otherwise
   */
  async expire(key, seconds) {
    this._recordCall('expire', [key, seconds]);
    if (this.store.has(key)) {
      this.expirations.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  /**
   * Get time-to-live for a key.
   * @param {string} key - Key to check
   * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    this._recordCall('ttl', [key]);
    if (!this.store.has(key)) return -2;
    const expiration = this.expirations.get(key);
    if (!expiration) return -1;
    return Math.max(0, Math.floor((expiration - Date.now()) / 1000));
  }

  /**
   * Increment a key by 1.
   * @param {string} key - Key to increment
   * @returns {Promise<number>} New value
   */
  async incr(key) {
    this._recordCall('incr', [key]);
    const current = parseInt(this.store.get(key) || '0', 10);
    const newValue = current + 1;
    this.store.set(key, String(newValue));
    return newValue;
  }

  /**
   * Get all keys matching a pattern.
   * @param {string} pattern - Glob pattern
   * @returns {Promise<string[]>} Matching keys
   */
  async keys(pattern) {
    this._recordCall('keys', [pattern]);
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  /**
   * Set multiple values.
   * @param {...string} pairs - Key-value pairs
   * @returns {Promise<string>} 'OK'
   */
  async mset(...pairs) {
    this._recordCall('mset', pairs);
    for (let i = 0; i < pairs.length; i += 2) {
      this.store.set(pairs[i], pairs[i + 1]);
    }
    return 'OK';
  }

  /**
   * Get multiple values.
   * @param {...string} keys - Keys to get
   * @returns {Promise<(string|null)[]>} Array of values
   */
  async mget(...keys) {
    this._recordCall('mget', keys);
    return keys.map((k) => this.store.get(k) ?? null);
  }

  /**
   * Push to the right of a list.
   * @param {string} key - List key
   * @param {...string} values - Values to push
   * @returns {Promise<number>} List length
   */
  async rpush(key, ...values) {
    this._recordCall('rpush', [key, ...values]);
    const list = JSON.parse(this.store.get(key) || '[]');
    list.push(...values);
    this.store.set(key, JSON.stringify(list));
    return list.length;
  }

  /**
   * Get a range from a list.
   * @param {string} key - List key
   * @param {number} start - Start index
   * @param {number} stop - Stop index
   * @returns {Promise<string[]>} List elements
   */
  async lrange(key, start, stop) {
    this._recordCall('lrange', [key, start, stop]);
    const list = JSON.parse(this.store.get(key) || '[]');
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }
}

/**
 * Create a new mock Redis instance.
 * @returns {MockRedis}
 */
function createMockRedis() {
  return new MockRedis();
}

module.exports = {
  MockRedis,
  createMockRedis,
};
