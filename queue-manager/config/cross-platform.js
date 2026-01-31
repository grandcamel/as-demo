/**
 * Cross-platform scenario configuration.
 *
 * These scenarios demonstrate workflows spanning multiple platforms:
 * Confluence + JIRA + Splunk working together.
 */

// Valid platform names (must match config/index.js VALID_PLATFORMS)
const VALID_PLATFORMS = ['confluence', 'jira', 'splunk'];

module.exports = {
  // Cross-platform scenarios
  SCENARIO_NAMES: {
    'incident-response': {
      file: 'cross-platform/incident-response.md',
      title: 'Incident Response',
      icon: '🚨',
      description: 'Splunk alerts -> Confluence runbook -> JIRA ticket',
      requiredPlatforms: ['splunk', 'confluence', 'jira'],
    },
    'sre-oncall': {
      file: 'cross-platform/sre-oncall.md',
      title: 'SRE On-Call',
      icon: '📟',
      description: 'Alert triage with knowledge base and task creation',
      requiredPlatforms: ['splunk', 'confluence', 'jira'],
    },
    'change-management': {
      file: 'cross-platform/change-management.md',
      title: 'Change Management',
      icon: '📋',
      description: 'JIRA change request -> Confluence docs -> Splunk monitoring',
      requiredPlatforms: ['jira', 'confluence', 'splunk'],
    },
    'knowledge-sync': {
      file: 'cross-platform/knowledge-sync.md',
      title: 'Knowledge Sync',
      icon: '📚',
      description: 'JIRA resolved issues -> Confluence release notes',
      requiredPlatforms: ['jira', 'confluence'],
    },
  },

  /**
   * Get scenarios that can run with the given enabled platforms.
   * @param {string[]} enabledPlatforms - List of enabled platform names
   * @returns {Object} Filtered scenario names
   */
  getAvailableScenarios(enabledPlatforms) {
    const available = {};
    for (const [key, scenario] of Object.entries(this.SCENARIO_NAMES)) {
      const hasAllRequired = scenario.requiredPlatforms.every((p) => enabledPlatforms.includes(p));
      if (hasAllRequired) {
        available[key] = scenario;
      }
    }
    return available;
  },

  /**
   * Validate all scenario configurations at load time.
   * Throws if any scenario has invalid platform requirements.
   */
  validateScenarios() {
    for (const [key, scenario] of Object.entries(this.SCENARIO_NAMES)) {
      const invalid = scenario.requiredPlatforms.filter((p) => !VALID_PLATFORMS.includes(p));
      if (invalid.length > 0) {
        throw new Error(
          `Cross-platform scenario '${key}' has invalid platform requirements: ${invalid.join(', ')}`
        );
      }
    }
  },
};

// Validate scenarios at module load time
module.exports.validateScenarios();
