/**
 * Configuration constants for the AS-Demo queue manager.
 *
 * Supports multi-platform configuration:
 * - Confluence
 * - JIRA
 * - Splunk
 * - Cross-platform scenarios
 *
 * Uses Zod for runtime validation of environment variables.
 */

const { parseEnv, VALID_PLATFORMS } = require('./schema');

// Parse and validate environment configuration
let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  console.error('FATAL: Configuration validation failed.');
  console.error(error.message);
  process.exit(1);
}

// Extract enabled platforms from validated config
const ENABLED_PLATFORMS = env.ENABLED_PLATFORMS;

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
  // Server (from validated env)
  PORT: env.PORT,
  REDIS_URL: env.REDIS_URL,

  // Session (from validated env)
  SESSION_TIMEOUT_MINUTES: env.SESSION_TIMEOUT_MINUTES,
  MAX_QUEUE_SIZE: env.MAX_QUEUE_SIZE,
  AVERAGE_SESSION_MINUTES: 45,
  TTYD_PORT: 7681,
  DISCONNECT_GRACE_MS: 10000,
  AUDIT_RETENTION_DAYS: 30,
  SESSION_SECRET: env.SESSION_SECRET,

  // Session environment files (for secure credential passing)
  SESSION_ENV_HOST_PATH: env.SESSION_ENV_HOST_PATH,
  SESSION_ENV_CONTAINER_PATH: '/run/session-env',

  // Rate limiting (from validated env)
  RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_CONNECTIONS: env.RATE_LIMIT_MAX_CONNECTIONS,

  // Invite brute-force protection (from validated env)
  INVITE_RATE_LIMIT_WINDOW_MS: env.INVITE_RATE_LIMIT_WINDOW_MS,
  INVITE_RATE_LIMIT_MAX_ATTEMPTS: env.INVITE_RATE_LIMIT_MAX_ATTEMPTS,

  // Claude authentication (from validated env)
  CLAUDE_CODE_OAUTH_TOKEN: env.CLAUDE_CODE_OAUTH_TOKEN,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,

  // Base URL and allowed origins (from validated env)
  BASE_URL: env.BASE_URL,
  ALLOWED_ORIGINS: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : [env.BASE_URL],
  COOKIE_SECURE: env.COOKIE_SECURE || env.NODE_ENV === 'production',

  // Multi-platform configuration
  VALID_PLATFORMS,
  ENABLED_PLATFORMS,
  platforms,
  crossPlatform,

  // Scenarios (from validated env)
  SCENARIOS_PATH: env.SCENARIOS_PATH,
  SCENARIO_NAMES: buildScenarioNames(),

  // Demo container image (from validated env)
  DEMO_CONTAINER_IMAGE: env.DEMO_CONTAINER_IMAGE,

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
