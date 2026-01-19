/**
 * Tests for config/platforms/splunk.js
 */

describe('splunk platform config', () => {
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
      process.env.SPLUNK_URL = 'https://splunk.test:8089';
      process.env.SPLUNK_WEB_URL = 'http://splunk.test:8000';
      process.env.SPLUNK_USERNAME = 'testuser';
      process.env.SPLUNK_PASSWORD = 'testpass';
      process.env.SPLUNK_HEC_TOKEN = 'test-hec-token';

      const splunk = require('../../../config/platforms/splunk');

      expect(splunk.URL).toBe('https://splunk.test:8089');
      expect(splunk.WEB_URL).toBe('http://splunk.test:8000');
      expect(splunk.USERNAME).toBe('testuser');
      expect(splunk.PASSWORD).toBe('testpass');
      expect(splunk.HEC_TOKEN).toBe('test-hec-token');
    });

    it('should use defaults when environment variables not set', () => {
      delete process.env.SPLUNK_URL;
      delete process.env.SPLUNK_WEB_URL;
      delete process.env.SPLUNK_USERNAME;
      delete process.env.SPLUNK_PASSWORD;
      delete process.env.SPLUNK_HEC_TOKEN;

      const splunk = require('../../../config/platforms/splunk');

      expect(splunk.URL).toBe('https://splunk:8089');
      expect(splunk.WEB_URL).toBe('http://splunk:8000');
      expect(splunk.USERNAME).toBe('admin');
      expect(splunk.PASSWORD).toBe('');
      expect(splunk.HEC_TOKEN).toBe('');
    });
  });

  describe('SCENARIO_NAMES', () => {
    it('should define all splunk scenarios', () => {
      const splunk = require('../../../config/platforms/splunk');
      const scenarios = splunk.SCENARIO_NAMES;

      expect(scenarios.devops).toBeDefined();
      expect(scenarios.sre).toBeDefined();
      expect(scenarios.support).toBeDefined();
      expect(scenarios.management).toBeDefined();
      expect(scenarios['splunk-search']).toBeDefined();
      expect(scenarios.alert).toBeDefined();
      expect(scenarios.job).toBeDefined();
      expect(scenarios.export).toBeDefined();
    });

    it('should have file property for all scenarios', () => {
      const splunk = require('../../../config/platforms/splunk');

      for (const [key, scenario] of Object.entries(splunk.SCENARIO_NAMES)) {
        expect(scenario.file).toBeDefined();
        expect(scenario.file).toMatch(/^splunk\//);
      }
    });
  });

  describe('getEnvVars', () => {
    it('should return environment variables for session', () => {
      process.env.SPLUNK_URL = 'https://splunk:8089';
      process.env.SPLUNK_WEB_URL = 'http://splunk:8000';
      process.env.SPLUNK_USERNAME = 'admin';
      process.env.SPLUNK_PASSWORD = 'secret';
      process.env.SPLUNK_HEC_TOKEN = 'hec-token';

      const splunk = require('../../../config/platforms/splunk');
      const envVars = splunk.getEnvVars();

      expect(envVars.SPLUNK_URL).toBe('https://splunk:8089');
      expect(envVars.SPLUNK_WEB_URL).toBe('http://splunk:8000');
      expect(envVars.SPLUNK_USERNAME).toBe('admin');
      expect(envVars.SPLUNK_PASSWORD).toBe('secret');
      expect(envVars.SPLUNK_HEC_TOKEN).toBe('hec-token');
      expect(envVars.SPLUNK_PROFILE).toBe('demo');
    });
  });

  describe('isConfigured', () => {
    it('should return true when URL, USERNAME and PASSWORD set', () => {
      process.env.SPLUNK_URL = 'https://splunk:8089';
      process.env.SPLUNK_USERNAME = 'admin';
      process.env.SPLUNK_PASSWORD = 'secret';

      const splunk = require('../../../config/platforms/splunk');

      expect(splunk.isConfigured()).toBe(true);
    });

    it('should return false when PASSWORD missing', () => {
      process.env.SPLUNK_URL = 'https://splunk:8089';
      process.env.SPLUNK_USERNAME = 'admin';
      delete process.env.SPLUNK_PASSWORD;

      const splunk = require('../../../config/platforms/splunk');

      expect(splunk.isConfigured()).toBe(false);
    });

    it('should return true with default URL and USERNAME if PASSWORD set', () => {
      delete process.env.SPLUNK_URL;
      delete process.env.SPLUNK_USERNAME;
      process.env.SPLUNK_PASSWORD = 'secret';

      const splunk = require('../../../config/platforms/splunk');

      // URL defaults to 'https://splunk:8089', USERNAME defaults to 'admin'
      expect(splunk.isConfigured()).toBe(true);
    });
  });
});
