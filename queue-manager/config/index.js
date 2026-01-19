/**
 * Configuration constants for the AS-Demo queue manager.
 *
 * Supports multi-platform configuration:
 * - Confluence
 * - JIRA
 * - Splunk
 * - Cross-platform scenarios
 */

// Valid platform names
const VALID_PLATFORMS = ['confluence', 'jira', 'splunk'];

// Parse enabled platforms from environment
const ENABLED_PLATFORMS = (process.env.ENABLED_PLATFORMS || 'confluence,jira,splunk')
  .split(',')
  .map(p => p.trim().toLowerCase())
  .filter(p => VALID_PLATFORMS.includes(p));

// Validate at least one platform is enabled
if (ENABLED_PLATFORMS.length === 0) {
  console.error('FATAL: No valid platforms enabled. Check ENABLED_PLATFORMS environment variable.');
  console.error(`Valid platforms: ${VALID_PLATFORMS.join(', ')}`);
  process.exit(1);
}

// Load platform configurations conditionally
const platforms = {};
if (ENABLED_PLATFORMS.includes('confluence')) {
  platforms.confluence = require('./platforms/confluence');
}
if (ENABLED_PLATFORMS.includes('jira')) {
  platforms.jira = require('./platforms/jira');
}
if (ENABLED_PLATFORMS.includes('splunk')) {
  platforms.splunk = require('./platforms/splunk');
}

// Cross-platform config always loaded
const crossPlatform = require('./cross-platform');

// Build combined scenario names from all enabled platforms
function buildScenarioNames() {
  const scenarios = {};

  // Add platform-specific scenarios with platform prefix for disambiguation
  for (const [platform, config] of Object.entries(platforms)) {
    for (const [key, scenario] of Object.entries(config.SCENARIO_NAMES)) {
      scenarios[key] = {
        ...scenario,
        platform: platform
      };
    }
  }

  // Add cross-platform scenarios that have all required platforms enabled
  const availableCrossScenarios = crossPlatform.getAvailableScenarios(ENABLED_PLATFORMS);
  for (const [key, scenario] of Object.entries(availableCrossScenarios)) {
    scenarios[key] = {
      ...scenario,
      platform: 'cross-platform'
    };
  }

  return scenarios;
}

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Session
  SESSION_TIMEOUT_MINUTES: parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10) || 60,
  MAX_QUEUE_SIZE: parseInt(process.env.MAX_QUEUE_SIZE, 10) || 10,
  AVERAGE_SESSION_MINUTES: 45,
  TTYD_PORT: 7681,
  DISCONNECT_GRACE_MS: 10000,
  AUDIT_RETENTION_DAYS: 30,
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-me-in-production',

  // Session environment files (for secure credential passing)
  SESSION_ENV_HOST_PATH: process.env.SESSION_ENV_HOST_PATH || '/tmp/session-env',
  SESSION_ENV_CONTAINER_PATH: '/run/session-env',

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000,  // 1 minute window
  RATE_LIMIT_MAX_CONNECTIONS: 10,    // Max connections per IP per window

  // Invite brute-force protection
  INVITE_RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,  // 1 hour window
  INVITE_RATE_LIMIT_MAX_ATTEMPTS: 10,            // Max failed attempts per IP per hour

  // Claude authentication
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // Base URL and allowed origins
  BASE_URL: process.env.BASE_URL || 'http://localhost:8080',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || process.env.BASE_URL || 'http://localhost:8080').split(',').map(o => o.trim()),
  COOKIE_SECURE: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',

  // Multi-platform configuration
  VALID_PLATFORMS,
  ENABLED_PLATFORMS,
  platforms,
  crossPlatform,

  // Scenarios
  SCENARIOS_PATH: '/opt/demo-container/scenarios',
  SCENARIO_NAMES: buildScenarioNames(),

  // Demo container image
  DEMO_CONTAINER_IMAGE: process.env.DEMO_CONTAINER_IMAGE || 'as-demo-container:latest',

  /**
   * Get all environment variables for a session (all enabled platforms).
   * @returns {Object} Combined environment variables
   */
  getAllEnvVars() {
    const envVars = {};

    // Add platform-specific env vars
    for (const [_platform, config] of Object.entries(platforms)) {
      if (config.isConfigured()) {
        Object.assign(envVars, config.getEnvVars());
      }
    }

    // Add Claude authentication
    if (this.CLAUDE_CODE_OAUTH_TOKEN) {
      envVars.CLAUDE_CODE_OAUTH_TOKEN = this.CLAUDE_CODE_OAUTH_TOKEN;
    }
    if (this.ANTHROPIC_API_KEY) {
      envVars.ANTHROPIC_API_KEY = this.ANTHROPIC_API_KEY;
    }

    return envVars;
  },

  /**
   * Get list of configured platforms.
   * @returns {string[]} Names of configured platforms
   */
  getConfiguredPlatforms() {
    return Object.entries(platforms)
      .filter(([, config]) => config.isConfigured())
      .map(([name]) => name);
  },

  /**
   * Get scenarios grouped by platform.
   * @returns {Object} Scenarios grouped by platform
   */
  getScenariosByPlatform() {
    const grouped = {
      'cross-platform': {},
      'confluence': {},
      'jira': {},
      'splunk': {}
    };

    for (const [key, scenario] of Object.entries(this.SCENARIO_NAMES)) {
      const platform = scenario.platform || 'unknown';
      if (grouped[platform]) {
        grouped[platform][key] = scenario;
      }
    }

    // Remove empty groups
    for (const [platform, scenarios] of Object.entries(grouped)) {
      if (Object.keys(scenarios).length === 0) {
        delete grouped[platform];
      }
    }

    return grouped;
  }
};
