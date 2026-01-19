/**
 * Tests for config/platforms/jira.js
 */

describe('jira platform config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('environment variables', () => {
    it('should use environment variables when set', () => {
      process.env.JIRA_API_TOKEN = 'test-token';
      process.env.JIRA_EMAIL = 'test@example.com';
      process.env.JIRA_SITE_URL = 'https://test.atlassian.net';
      process.env.DEMO_PROJECT_KEY = 'TEST';

      const jira = require('../../../config/platforms/jira');

      expect(jira.API_TOKEN).toBe('test-token');
      expect(jira.EMAIL).toBe('test@example.com');
      expect(jira.SITE_URL).toBe('https://test.atlassian.net');
      expect(jira.DEMO_PROJECT_KEY).toBe('TEST');
    });

    it('should use defaults when environment variables not set', () => {
      delete process.env.JIRA_API_TOKEN;
      delete process.env.JIRA_EMAIL;
      delete process.env.JIRA_SITE_URL;
      delete process.env.DEMO_PROJECT_KEY;

      const jira = require('../../../config/platforms/jira');

      expect(jira.API_TOKEN).toBe('');
      expect(jira.EMAIL).toBe('');
      expect(jira.SITE_URL).toBe('');
      expect(jira.DEMO_PROJECT_KEY).toBe('DEMO');
    });
  });

  describe('SCENARIO_NAMES', () => {
    it('should define all jira scenarios', () => {
      const jira = require('../../../config/platforms/jira');
      const scenarios = jira.SCENARIO_NAMES;

      expect(scenarios.issue).toBeDefined();
      expect(scenarios['jira-search']).toBeDefined();
      expect(scenarios.agile).toBeDefined();
      expect(scenarios.jsm).toBeDefined();
    });

    it('should have file property for all scenarios', () => {
      const jira = require('../../../config/platforms/jira');

      for (const [key, scenario] of Object.entries(jira.SCENARIO_NAMES)) {
        expect(scenario.file).toBeDefined();
        expect(scenario.file).toMatch(/^jira\//);
      }
    });
  });

  describe('getEnvVars', () => {
    it('should return environment variables for session', () => {
      process.env.JIRA_API_TOKEN = 'my-token';
      process.env.JIRA_EMAIL = 'my@email.com';
      process.env.JIRA_SITE_URL = 'https://my.atlassian.net';

      const jira = require('../../../config/platforms/jira');
      const envVars = jira.getEnvVars();

      expect(envVars.JIRA_API_TOKEN).toBe('my-token');
      expect(envVars.JIRA_EMAIL).toBe('my@email.com');
      expect(envVars.JIRA_SITE_URL).toBe('https://my.atlassian.net');
      expect(envVars.JIRA_PROFILE).toBe('demo');
    });
  });

  describe('isConfigured', () => {
    it('should return true when all required vars set', () => {
      process.env.JIRA_API_TOKEN = 'token';
      process.env.JIRA_EMAIL = 'email';
      process.env.JIRA_SITE_URL = 'url';

      const jira = require('../../../config/platforms/jira');

      expect(jira.isConfigured()).toBe(true);
    });

    it('should return false when API_TOKEN missing', () => {
      delete process.env.JIRA_API_TOKEN;
      process.env.JIRA_EMAIL = 'email';
      process.env.JIRA_SITE_URL = 'url';

      const jira = require('../../../config/platforms/jira');

      expect(jira.isConfigured()).toBe(false);
    });

    it('should return false when EMAIL missing', () => {
      process.env.JIRA_API_TOKEN = 'token';
      delete process.env.JIRA_EMAIL;
      process.env.JIRA_SITE_URL = 'url';

      const jira = require('../../../config/platforms/jira');

      expect(jira.isConfigured()).toBe(false);
    });

    it('should return false when SITE_URL missing', () => {
      process.env.JIRA_API_TOKEN = 'token';
      process.env.JIRA_EMAIL = 'email';
      delete process.env.JIRA_SITE_URL;

      const jira = require('../../../config/platforms/jira');

      expect(jira.isConfigured()).toBe(false);
    });
  });
});
