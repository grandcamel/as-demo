/**
 * Platform Adapter Interface
 *
 * Defines the formal contract for platform integrations.
 * All platform configs (confluence, jira, splunk) should conform to this interface.
 *
 * Benefits:
 * - Type-safe platform integration
 * - Uniform interface for all platforms
 * - Enables dynamic platform loading and third-party plugins
 */

/**
 * @typedef {Object} Scenario
 * @property {string} file - Path to scenario file relative to scenarios directory
 * @property {string} title - Human-readable title
 * @property {string} [icon] - Optional emoji icon
 * @property {string} [description] - Optional description
 */

/**
 * @typedef {Object} PlatformConfig
 * @property {Object.<string, Scenario>} SCENARIO_NAMES - Available scenarios for this platform
 * @property {function(): Object} getEnvVars - Get environment variables for session
 * @property {function(): boolean} isConfigured - Check if platform is properly configured
 * @property {function(): Promise<boolean>} [validateCredentials] - Optional: validate credentials with remote service
 * @property {function(): string[]} [getCleanupScript] - Optional: cleanup commands for session end
 */

/**
 * Base class for platform adapters.
 * Platforms can extend this class or implement the interface directly.
 */
class PlatformAdapter {
  /**
   * Create a new platform adapter.
   * @param {string} id - Platform identifier (e.g., 'confluence', 'jira')
   * @param {string} displayName - Human-readable name
   */
  constructor(id, displayName) {
    this.id = id;
    this.displayName = displayName;
    this.SCENARIO_NAMES = {};
  }

  /**
   * Get environment variables for session.
   * @returns {Object} Key-value pairs of environment variables
   */
  getEnvVars() {
    throw new Error('getEnvVars() must be implemented by platform adapter');
  }

  /**
   * Check if platform is properly configured.
   * @returns {boolean} True if all required credentials are present
   */
  isConfigured() {
    throw new Error('isConfigured() must be implemented by platform adapter');
  }

  /**
   * Optional: Validate credentials with remote service.
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   */
  async validateCredentials() {
    // Default implementation: assume valid if configured
    return { valid: this.isConfigured() };
  }

  /**
   * Optional: Get cleanup script for session end.
   * @returns {string[]} Array of shell commands to run
   */
  getCleanupScript() {
    return [];
  }

  /**
   * Get diagnostics for this platform.
   * @returns {Object[]} Array of diagnostic messages
   */
  getDiagnostics() {
    const diagnostics = [];

    if (!this.isConfigured()) {
      diagnostics.push({
        level: 'warning',
        message: `${this.displayName} is not configured`,
        platform: this.id,
      });
    }

    return diagnostics;
  }
}

/**
 * Validate that a config object conforms to the platform adapter interface.
 * @param {Object} config - Platform config to validate
 * @param {string} platformId - Platform identifier for error messages
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validatePlatformConfig(config, platformId) {
  const errors = [];

  if (!config) {
    return { valid: false, errors: [`${platformId}: config is null or undefined`] };
  }

  // Required: SCENARIO_NAMES
  if (!config.SCENARIO_NAMES || typeof config.SCENARIO_NAMES !== 'object') {
    errors.push(`${platformId}: missing or invalid SCENARIO_NAMES`);
  }

  // Required: getEnvVars
  if (typeof config.getEnvVars !== 'function') {
    errors.push(`${platformId}: missing getEnvVars() function`);
  }

  // Required: isConfigured
  if (typeof config.isConfigured !== 'function') {
    errors.push(`${platformId}: missing isConfigured() function`);
  }

  // Optional: validateCredentials (if present, must be function)
  if (
    config.validateCredentials !== undefined &&
    typeof config.validateCredentials !== 'function'
  ) {
    errors.push(`${platformId}: validateCredentials must be a function`);
  }

  // Optional: getCleanupScript (if present, must be function)
  if (config.getCleanupScript !== undefined && typeof config.getCleanupScript !== 'function') {
    errors.push(`${platformId}: getCleanupScript must be a function`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PlatformAdapter,
  validatePlatformConfig,
};
