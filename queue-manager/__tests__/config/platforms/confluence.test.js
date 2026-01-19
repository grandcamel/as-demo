/**
 * Tests for config/platforms/confluence.js
 */

describe('confluence platform config', () => {
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
      process.env.CONFLUENCE_API_TOKEN = 'test-token';
      process.env.CONFLUENCE_EMAIL = 'test@example.com';
      process.env.CONFLUENCE_SITE_URL = 'https://test.atlassian.net';
      process.env.DEMO_SPACE_KEY = 'TEST';

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.API_TOKEN).toBe('test-token');
      expect(confluence.EMAIL).toBe('test@example.com');
      expect(confluence.SITE_URL).toBe('https://test.atlassian.net');
      expect(confluence.DEMO_SPACE_KEY).toBe('TEST');
    });

    it('should use defaults when environment variables not set', () => {
      delete process.env.CONFLUENCE_API_TOKEN;
      delete process.env.CONFLUENCE_EMAIL;
      delete process.env.CONFLUENCE_SITE_URL;
      delete process.env.DEMO_SPACE_KEY;

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.API_TOKEN).toBe('');
      expect(confluence.EMAIL).toBe('');
      expect(confluence.SITE_URL).toBe('');
      expect(confluence.DEMO_SPACE_KEY).toBe('CDEMO');
    });
  });

  describe('SCENARIO_NAMES', () => {
    it('should define all confluence scenarios', () => {
      const confluence = require('../../../config/platforms/confluence');
      const scenarios = confluence.SCENARIO_NAMES;

      expect(scenarios.page).toBeDefined();
      expect(scenarios.search).toBeDefined();
      expect(scenarios.space).toBeDefined();
      expect(scenarios.hierarchy).toBeDefined();
      expect(scenarios.template).toBeDefined();
      expect(scenarios.comment).toBeDefined();
      expect(scenarios.attachment).toBeDefined();
      expect(scenarios.label).toBeDefined();
      expect(scenarios.permission).toBeDefined();
      expect(scenarios.bulk).toBeDefined();
      expect(scenarios.analytics).toBeDefined();
    });

    it('should have file property for all scenarios', () => {
      const confluence = require('../../../config/platforms/confluence');

      for (const [key, scenario] of Object.entries(confluence.SCENARIO_NAMES)) {
        expect(scenario.file).toBeDefined();
        expect(scenario.file).toMatch(/^confluence\//);
      }
    });
  });

  describe('getEnvVars', () => {
    it('should return environment variables for session', () => {
      process.env.CONFLUENCE_API_TOKEN = 'my-token';
      process.env.CONFLUENCE_EMAIL = 'my@email.com';
      process.env.CONFLUENCE_SITE_URL = 'https://my.atlassian.net';

      const confluence = require('../../../config/platforms/confluence');
      const envVars = confluence.getEnvVars();

      expect(envVars.CONFLUENCE_API_TOKEN).toBe('my-token');
      expect(envVars.CONFLUENCE_EMAIL).toBe('my@email.com');
      expect(envVars.CONFLUENCE_SITE_URL).toBe('https://my.atlassian.net');
      expect(envVars.CONFLUENCE_PROFILE).toBe('demo');
    });
  });

  describe('isConfigured', () => {
    it('should return true when all required vars set', () => {
      process.env.CONFLUENCE_API_TOKEN = 'token';
      process.env.CONFLUENCE_EMAIL = 'email';
      process.env.CONFLUENCE_SITE_URL = 'url';

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.isConfigured()).toBe(true);
    });

    it('should return false when API_TOKEN missing', () => {
      delete process.env.CONFLUENCE_API_TOKEN;
      process.env.CONFLUENCE_EMAIL = 'email';
      process.env.CONFLUENCE_SITE_URL = 'url';

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.isConfigured()).toBe(false);
    });

    it('should return false when EMAIL missing', () => {
      process.env.CONFLUENCE_API_TOKEN = 'token';
      delete process.env.CONFLUENCE_EMAIL;
      process.env.CONFLUENCE_SITE_URL = 'url';

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.isConfigured()).toBe(false);
    });

    it('should return false when SITE_URL missing', () => {
      process.env.CONFLUENCE_API_TOKEN = 'token';
      process.env.CONFLUENCE_EMAIL = 'email';
      delete process.env.CONFLUENCE_SITE_URL;

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.isConfigured()).toBe(false);
    });

    it('should return false when all missing', () => {
      delete process.env.CONFLUENCE_API_TOKEN;
      delete process.env.CONFLUENCE_EMAIL;
      delete process.env.CONFLUENCE_SITE_URL;

      const confluence = require('../../../config/platforms/confluence');

      expect(confluence.isConfigured()).toBe(false);
    });
  });
});
