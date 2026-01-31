/**
 * Confluence platform configuration.
 */

module.exports = {
  // Confluence credentials
  API_TOKEN: process.env.CONFLUENCE_API_TOKEN || '',
  EMAIL: process.env.CONFLUENCE_EMAIL || '',
  SITE_URL: process.env.CONFLUENCE_SITE_URL || '',
  DEMO_SPACE_KEY: process.env.DEMO_SPACE_KEY || 'CDEMO',

  // Confluence scenarios
  SCENARIO_NAMES: {
    page: { file: 'confluence/page.md', title: 'Page Management', icon: '📝' },
    search: { file: 'confluence/search.md', title: 'CQL Search', icon: '🔍' },
    space: { file: 'confluence/space.md', title: 'Space Management', icon: '🏠' },
    hierarchy: { file: 'confluence/hierarchy.md', title: 'Page Hierarchy', icon: '🌳' },
    template: { file: 'confluence/template.md', title: 'Templates', icon: '📋' },
    comment: { file: 'confluence/comment.md', title: 'Comments', icon: '💬' },
    attachment: { file: 'confluence/attachment.md', title: 'Attachments', icon: '📎' },
    label: { file: 'confluence/label.md', title: 'Labels', icon: '🏷️' },
    permission: { file: 'confluence/permission.md', title: 'Permissions', icon: '🔒' },
    bulk: { file: 'confluence/bulk.md', title: 'Bulk Operations', icon: '📦' },
    analytics: { file: 'confluence/analytics.md', title: 'Analytics', icon: '📊' },
  },

  /**
   * Get environment variables for session.
   * @returns {Object} Environment variables
   */
  getEnvVars() {
    return {
      CONFLUENCE_API_TOKEN: this.API_TOKEN,
      CONFLUENCE_EMAIL: this.EMAIL,
      CONFLUENCE_SITE_URL: this.SITE_URL,
      CONFLUENCE_PROFILE: 'demo',
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
