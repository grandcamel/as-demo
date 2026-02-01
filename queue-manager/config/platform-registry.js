/**
 * Platform Registry
 *
 * Manages platform adapters with dynamic loading and discovery.
 * Enables third-party platform plugins and runtime registration.
 *
 * Usage:
 *   const registry = require('./platform-registry');
 *   registry.register('confluence', require('./platforms/confluence'));
 *   const platform = registry.get('confluence');
 */

const { validatePlatformConfig } = require('./platform-adapter');

/**
 * @typedef {Object} RegisteredPlatform
 * @property {string} id - Platform identifier
 * @property {Object} config - Platform configuration
 * @property {boolean} enabled - Whether platform is enabled
 * @property {string} [source] - Where the platform was loaded from
 */

class PlatformRegistry {
  constructor() {
    /** @type {Map<string, RegisteredPlatform>} */
    this.platforms = new Map();

    /** @type {Map<string, Object>} */
    this.scenarios = new Map();

    /** @type {Object[]} */
    this.diagnostics = [];
  }

  /**
   * Register a platform with the registry.
   * @param {string} id - Platform identifier
   * @param {Object} config - Platform configuration conforming to PlatformAdapter interface
   * @param {Object} [options] - Registration options
   * @param {boolean} [options.enabled=true] - Whether platform is enabled
   * @param {string} [options.source='builtin'] - Source of the platform (builtin, plugin, etc.)
   * @returns {PlatformRegistry} this (for chaining)
   */
  register(id, config, options = {}) {
    const { enabled = true, source = 'builtin' } = options;

    // Validate config conforms to interface
    const validation = validatePlatformConfig(config, id);
    if (!validation.valid) {
      this.diagnostics.push({
        level: 'error',
        message: `Failed to register platform ${id}`,
        errors: validation.errors,
        platform: id,
      });
      throw new Error(`Invalid platform config for ${id}: ${validation.errors.join(', ')}`);
    }

    // Register the platform
    this.platforms.set(id, { id, config, enabled, source });

    // Register scenarios if platform is enabled
    if (enabled && config.SCENARIO_NAMES) {
      for (const [key, scenario] of Object.entries(config.SCENARIO_NAMES)) {
        this.scenarios.set(key, {
          ...scenario,
          platform: id,
        });
      }
    }

    return this;
  }

  /**
   * Unregister a platform.
   * @param {string} id - Platform identifier
   * @returns {boolean} True if platform was removed
   */
  unregister(id) {
    const platform = this.platforms.get(id);
    if (!platform) return false;

    // Remove scenarios for this platform
    for (const [key, scenario] of this.scenarios.entries()) {
      if (scenario.platform === id) {
        this.scenarios.delete(key);
      }
    }

    return this.platforms.delete(id);
  }

  /**
   * Get a registered platform by ID.
   * @param {string} id - Platform identifier
   * @returns {Object|undefined} Platform config or undefined
   */
  get(id) {
    const platform = this.platforms.get(id);
    return platform?.config;
  }

  /**
   * Check if a platform is registered.
   * @param {string} id - Platform identifier
   * @returns {boolean}
   */
  has(id) {
    return this.platforms.has(id);
  }

  /**
   * Check if a platform is registered and enabled.
   * @param {string} id - Platform identifier
   * @returns {boolean}
   */
  isEnabled(id) {
    const platform = this.platforms.get(id);
    return platform?.enabled ?? false;
  }

  /**
   * Get all registered platforms.
   * @param {Object} [options] - Filter options
   * @param {boolean} [options.enabledOnly=false] - Only return enabled platforms
   * @param {boolean} [options.configuredOnly=false] - Only return configured platforms
   * @returns {Object} Map of platform ID to config
   */
  getAll(options = {}) {
    const { enabledOnly = false, configuredOnly = false } = options;
    const result = {};

    for (const [id, platform] of this.platforms.entries()) {
      if (enabledOnly && !platform.enabled) continue;
      if (configuredOnly && !platform.config.isConfigured()) continue;
      result[id] = platform.config;
    }

    return result;
  }

  /**
   * Get list of platform IDs.
   * @param {Object} [options] - Filter options
   * @param {boolean} [options.enabledOnly=false] - Only return enabled platforms
   * @param {boolean} [options.configuredOnly=false] - Only return configured platforms
   * @returns {string[]} Array of platform IDs
   */
  list(options = {}) {
    return Object.keys(this.getAll(options));
  }

  /**
   * Get all scenarios from all registered platforms.
   * @returns {Object} Map of scenario key to scenario config
   */
  getAllScenarios() {
    return Object.fromEntries(this.scenarios);
  }

  /**
   * Get scenarios grouped by platform.
   * @returns {Object} Map of platform ID to scenarios
   */
  getScenariosByPlatform() {
    const grouped = {};

    for (const [key, scenario] of this.scenarios.entries()) {
      const platform = scenario.platform;
      if (!grouped[platform]) {
        grouped[platform] = {};
      }
      grouped[platform][key] = scenario;
    }

    return grouped;
  }

  /**
   * Get combined environment variables from all configured platforms.
   * @returns {Object} Combined environment variables
   */
  getAllEnvVars() {
    const envVars = {};

    for (const [_id, platform] of this.platforms.entries()) {
      if (platform.enabled && platform.config.isConfigured()) {
        Object.assign(envVars, platform.config.getEnvVars());
      }
    }

    return envVars;
  }

  /**
   * Get diagnostics for all platforms.
   * @returns {Object[]} Array of diagnostic messages
   */
  getDiagnostics() {
    const diagnostics = [...this.diagnostics];

    for (const [id, platform] of this.platforms.entries()) {
      // Check for enabled but not configured
      if (platform.enabled && !platform.config.isConfigured()) {
        diagnostics.push({
          level: 'warning',
          message: `Platform ${id} is enabled but not configured`,
          platform: id,
        });
      }

      // Check for configured but not enabled
      if (!platform.enabled && platform.config.isConfigured()) {
        diagnostics.push({
          level: 'info',
          message: `Platform ${id} is configured but not enabled`,
          platform: id,
        });
      }

      // Get platform-specific diagnostics if available
      if (typeof platform.config.getDiagnostics === 'function') {
        diagnostics.push(...platform.config.getDiagnostics());
      }
    }

    return diagnostics;
  }

  /**
   * Validate all registered platforms.
   * @returns {Promise<{valid: boolean, results: Object}>}
   */
  async validateAll() {
    const results = {};
    let allValid = true;

    for (const [id, platform] of this.platforms.entries()) {
      if (!platform.enabled) continue;

      if (typeof platform.config.validateCredentials === 'function') {
        try {
          results[id] = await platform.config.validateCredentials();
          if (!results[id].valid) allValid = false;
        } catch (error) {
          results[id] = { valid: false, error: error.message };
          allValid = false;
        }
      } else {
        results[id] = { valid: platform.config.isConfigured() };
        if (!results[id].valid) allValid = false;
      }
    }

    return { valid: allValid, results };
  }

  /**
   * Clear all registered platforms.
   */
  clear() {
    this.platforms.clear();
    this.scenarios.clear();
    this.diagnostics = [];
  }
}

// Export singleton instance
const registry = new PlatformRegistry();

module.exports = registry;
module.exports.PlatformRegistry = PlatformRegistry;
