/**
 * Splunk platform configuration.
 */

module.exports = {
  // Splunk credentials
  URL: process.env.SPLUNK_URL || 'https://splunk:8089',
  WEB_URL: process.env.SPLUNK_WEB_URL || 'http://splunk:8000',
  USERNAME: process.env.SPLUNK_USERNAME || 'admin',
  PASSWORD: process.env.SPLUNK_PASSWORD || '',
  HEC_TOKEN: process.env.SPLUNK_HEC_TOKEN || '',

  // Splunk scenarios
  SCENARIO_NAMES: {
    devops: { file: 'splunk/devops.md', title: 'DevOps Engineer', icon: '🔧' },
    sre: { file: 'splunk/sre.md', title: 'SRE / On-Call', icon: '🚨' },
    support: { file: 'splunk/support.md', title: 'Support Engineer', icon: '🎧' },
    management: { file: 'splunk/management.md', title: 'Management', icon: '📊' },
    'splunk-search': { file: 'splunk/search.md', title: 'Search Basics', icon: '🔍' },
    alert: { file: 'splunk/alert.md', title: 'Alert Management', icon: '🔔' },
    job: { file: 'splunk/job.md', title: 'Job Management', icon: '⚙️' },
    export: { file: 'splunk/export.md', title: 'Data Export', icon: '📥' },
  },

  /**
   * Get environment variables for session.
   * @returns {Object} Environment variables
   */
  getEnvVars() {
    return {
      SPLUNK_URL: this.URL,
      SPLUNK_WEB_URL: this.WEB_URL,
      SPLUNK_USERNAME: this.USERNAME,
      SPLUNK_PASSWORD: this.PASSWORD,
      SPLUNK_HEC_TOKEN: this.HEC_TOKEN,
      SPLUNK_PROFILE: 'demo',
    };
  },

  /**
   * Check if platform is configured.
   * @returns {boolean} Whether platform is configured
   */
  isConfigured() {
    return !!(this.URL && this.USERNAME && this.PASSWORD);
  },
};
