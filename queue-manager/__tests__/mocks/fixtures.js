/**
 * Test fixtures and data builders for queue manager tests.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Create a mock client object.
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Client object
 */
function createClient(overrides = {}) {
  return {
    id: overrides.id || uuidv4(),
    state: overrides.state || 'connected',
    joinedAt: overrides.joinedAt || new Date(),
    inviteToken: overrides.inviteToken || null,
    pendingSessionToken: overrides.pendingSessionToken || null,
    ip: overrides.ip || '127.0.0.1',
    userAgent: overrides.userAgent || 'Test Client',
    ...overrides,
  };
}

/**
 * Create a mock active session object.
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Session object
 */
function createSession(overrides = {}) {
  const sessionId = overrides.sessionId || uuidv4();
  const clientId = overrides.clientId || uuidv4();
  const startedAt = overrides.startedAt || new Date();
  const timeoutMinutes = overrides.timeoutMinutes || 30;

  return {
    clientId,
    sessionId,
    sessionToken: overrides.sessionToken || `token-${sessionId}`,
    ttydProcess: overrides.ttydProcess || createMockProcess(),
    startedAt,
    expiresAt: overrides.expiresAt || new Date(startedAt.getTime() + timeoutMinutes * 60 * 1000),
    inviteToken: overrides.inviteToken || null,
    ip: overrides.ip || '127.0.0.1',
    userAgent: overrides.userAgent || 'Test Client',
    queueWaitMs: overrides.queueWaitMs || 0,
    errors: overrides.errors || [],
    envFileCleanup: overrides.envFileCleanup || (() => {}),
    hardTimeout: overrides.hardTimeout || null,
    ...overrides,
  };
}

/**
 * Create a mock child process.
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Mock process
 */
function createMockProcess(overrides = {}) {
  const process = {
    pid: overrides.pid || Math.floor(Math.random() * 10000) + 1000,
    killed: false,
    exitCode: null,
    _events: {},
    kill: function (signal) {
      this.killed = true;
      if (this._events.exit) {
        this._events.exit(0, signal);
      }
    },
    on: function (event, handler) {
      this._events[event] = handler;
      return this;
    },
    stdout: {
      on: () => {},
    },
    stderr: {
      on: () => {},
    },
    ...overrides,
  };
  return process;
}

/**
 * Create a mock invite token record.
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Invite token record
 */
function createInviteToken(overrides = {}) {
  const createdAt = overrides.createdAt || new Date();
  const expiresInDays = overrides.expiresInDays || 7;

  return {
    token: overrides.token || `invite-${uuidv4().slice(0, 8)}`,
    label: overrides.label || 'Test Invite',
    createdAt: createdAt.toISOString(),
    expiresAt:
      overrides.expiresAt || new Date(createdAt.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    usageCount: overrides.usageCount || 0,
    maxUsages: overrides.maxUsages || 10,
    createdBy: overrides.createdBy || 'test',
    ...overrides,
  };
}

/**
 * Create a mock queue state.
 * @param {Object} [options] - Options
 * @returns {Object} Queue state
 */
function createQueueState(options = {}) {
  const { size = 0, clientIds = [] } = options;

  // Generate client IDs if size is specified but no IDs provided
  const ids = clientIds.length > 0 ? clientIds : Array.from({ length: size }, () => uuidv4());

  return {
    queue: [...ids],
    clients: new Map(),
    sessionTokens: new Map(),
    pendingSessionTokens: new Map(),
    activeSession: null,
  };
}

/**
 * Create mock platform config.
 * @param {string} platform - Platform name
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Platform config
 */
function createPlatformConfig(platform, overrides = {}) {
  const configs = {
    confluence: {
      API_TOKEN: 'test-confluence-token',
      EMAIL: 'test@example.com',
      SITE_URL: 'https://test.atlassian.net/wiki',
      DEMO_SPACE_KEY: 'TEST',
      SCENARIO_NAMES: {
        page: { file: 'confluence/page.md', title: 'Page Management', icon: '📝' },
      },
      getEnvVars: function () {
        return {
          CONFLUENCE_API_TOKEN: this.API_TOKEN,
          CONFLUENCE_EMAIL: this.EMAIL,
          CONFLUENCE_SITE_URL: this.SITE_URL,
        };
      },
      isConfigured: function () {
        return !!(this.API_TOKEN && this.EMAIL && this.SITE_URL);
      },
      ...overrides,
    },
    jira: {
      API_TOKEN: 'test-jira-token',
      EMAIL: 'test@example.com',
      SITE_URL: 'https://test.atlassian.net',
      DEMO_PROJECT_KEY: 'TEST',
      SCENARIO_NAMES: {
        issue: { file: 'jira/issue.md', title: 'Issue Management', icon: '📝' },
      },
      getEnvVars: function () {
        return {
          JIRA_API_TOKEN: this.API_TOKEN,
          JIRA_EMAIL: this.EMAIL,
          JIRA_SITE_URL: this.SITE_URL,
        };
      },
      isConfigured: function () {
        return !!(this.API_TOKEN && this.EMAIL && this.SITE_URL);
      },
      ...overrides,
    },
    splunk: {
      URL: 'https://localhost:8089',
      WEB_URL: 'http://localhost:8000',
      USERNAME: 'admin',
      PASSWORD: 'testpass',
      HEC_TOKEN: 'test-hec-token',
      SCENARIO_NAMES: {
        sre: { file: 'splunk/sre.md', title: 'SRE / On-Call', icon: '🚨' },
      },
      getEnvVars: function () {
        return {
          SPLUNK_URL: this.URL,
          SPLUNK_USERNAME: this.USERNAME,
          SPLUNK_PASSWORD: this.PASSWORD,
        };
      },
      isConfigured: function () {
        return !!(this.URL && this.USERNAME && this.PASSWORD);
      },
      ...overrides,
    },
  };

  return configs[platform] || configs.confluence;
}

/**
 * Create mock config object.
 * @param {Object} [overrides] - Property overrides
 * @returns {Object} Config object
 */
function createConfig(overrides = {}) {
  return {
    PORT: overrides.PORT || 3000,
    REDIS_URL: overrides.REDIS_URL || 'redis://localhost:6379',
    SESSION_TIMEOUT_MINUTES: overrides.SESSION_TIMEOUT_MINUTES || 30,
    MAX_QUEUE_SIZE: overrides.MAX_QUEUE_SIZE || 10,
    TTYD_PORT: overrides.TTYD_PORT || 7681,
    DISCONNECT_GRACE_MS: overrides.DISCONNECT_GRACE_MS || 10000,
    AUDIT_RETENTION_DAYS: overrides.AUDIT_RETENTION_DAYS || 30,
    SESSION_SECRET: overrides.SESSION_SECRET || 'test-secret',
    SESSION_ENV_HOST_PATH: overrides.SESSION_ENV_HOST_PATH || '/tmp/session-env',
    SESSION_ENV_CONTAINER_PATH: overrides.SESSION_ENV_CONTAINER_PATH || '/run/session-env',
    RATE_LIMIT_WINDOW_MS: overrides.RATE_LIMIT_WINDOW_MS || 60000,
    RATE_LIMIT_MAX_CONNECTIONS: overrides.RATE_LIMIT_MAX_CONNECTIONS || 10,
    INVITE_RATE_LIMIT_WINDOW_MS: overrides.INVITE_RATE_LIMIT_WINDOW_MS || 60000,
    INVITE_RATE_LIMIT_MAX_ATTEMPTS: overrides.INVITE_RATE_LIMIT_MAX_ATTEMPTS || 5,
    CLAUDE_CODE_OAUTH_TOKEN: overrides.CLAUDE_CODE_OAUTH_TOKEN || null,
    ANTHROPIC_API_KEY: overrides.ANTHROPIC_API_KEY || null,
    BASE_URL: overrides.BASE_URL || 'http://localhost:3000',
    ALLOWED_ORIGINS: overrides.ALLOWED_ORIGINS || ['http://localhost:3000'],
    COOKIE_SECURE: overrides.COOKIE_SECURE || false,
    VALID_PLATFORMS: overrides.VALID_PLATFORMS || ['confluence', 'jira', 'splunk'],
    ENABLED_PLATFORMS: overrides.ENABLED_PLATFORMS || ['confluence', 'jira'],
    platforms: overrides.platforms || {
      confluence: createPlatformConfig('confluence'),
      jira: createPlatformConfig('jira'),
    },
    SCENARIOS_PATH: overrides.SCENARIOS_PATH || '/opt/scenarios',
    SCENARIO_NAMES: overrides.SCENARIO_NAMES || {},
    DEMO_CONTAINER_IMAGE: overrides.DEMO_CONTAINER_IMAGE || 'demo-container:latest',
    getAllEnvVars: function () {
      const envVars = {};
      for (const [, config] of Object.entries(this.platforms)) {
        if (config.isConfigured()) {
          Object.assign(envVars, config.getEnvVars());
        }
      }
      return envVars;
    },
    getConfiguredPlatforms: function () {
      return Object.entries(this.platforms)
        .filter(([, config]) => config.isConfigured())
        .map(([name]) => name);
    },
    ...overrides,
  };
}

module.exports = {
  createClient,
  createSession,
  createMockProcess,
  createInviteToken,
  createQueueState,
  createPlatformConfig,
  createConfig,
};
