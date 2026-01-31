/**
 * JIRA platform configuration.
 */

module.exports = {
  // JIRA credentials
  API_TOKEN: process.env.JIRA_API_TOKEN || '',
  EMAIL: process.env.JIRA_EMAIL || '',
  SITE_URL: process.env.JIRA_SITE_URL || '',
  DEMO_PROJECT_KEY: process.env.DEMO_PROJECT_KEY || 'DEMO',

  // JIRA scenarios
  SCENARIO_NAMES: {
    issue: { file: 'jira/issue.md', title: 'Issue Management', icon: '📝' },
    'jira-search': { file: 'jira/search.md', title: 'JQL Search', icon: '🔍' },
    agile: { file: 'jira/agile.md', title: 'Agile & Sprints', icon: '🏃' },
    jsm: { file: 'jira/jsm.md', title: 'Service Desk', icon: '🎫' },
  },

  /**
   * Get environment variables for session.
   * @returns {Object} Environment variables
   */
  getEnvVars() {
    return {
      JIRA_API_TOKEN: this.API_TOKEN,
      JIRA_EMAIL: this.EMAIL,
      JIRA_SITE_URL: this.SITE_URL,
      JIRA_PROFILE: 'demo',
    };
  },

  /**
   * Check if platform is configured.
   * @returns {boolean} Whether platform is configured
   */
  isConfigured() {
    return !!(this.API_TOKEN && this.EMAIL && this.SITE_URL);
  },
};
