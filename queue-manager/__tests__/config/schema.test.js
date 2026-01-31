/**
 * Tests for config/schema.js
 *
 * Tests Zod schema validation for environment variables.
 */

const { parseEnv, VALID_PLATFORMS, envSchema } = require('../../config/schema');

describe('config/schema', () => {
  describe('VALID_PLATFORMS', () => {
    it('should include confluence, jira, and splunk', () => {
      expect(VALID_PLATFORMS).toContain('confluence');
      expect(VALID_PLATFORMS).toContain('jira');
      expect(VALID_PLATFORMS).toContain('splunk');
      expect(VALID_PLATFORMS).toHaveLength(3);
    });
  });

  describe('parseEnv', () => {
    it('should return defaults for empty environment', () => {
      const result = parseEnv({});

      expect(result.PORT).toBe(3000);
      expect(result.REDIS_URL).toBe('redis://localhost:6379');
      expect(result.BASE_URL).toBe('http://localhost:8080');
      expect(result.SESSION_TIMEOUT_MINUTES).toBe(60);
      expect(result.MAX_QUEUE_SIZE).toBe(10);
      expect(result.SESSION_SECRET).toBe('change-me-in-production');
    });

    it('should parse ENABLED_PLATFORMS correctly', () => {
      const result = parseEnv({ ENABLED_PLATFORMS: 'confluence,jira' });

      expect(result.ENABLED_PLATFORMS).toEqual(['confluence', 'jira']);
    });

    it('should filter invalid platforms', () => {
      const result = parseEnv({ ENABLED_PLATFORMS: 'confluence,invalid,jira' });

      expect(result.ENABLED_PLATFORMS).toEqual(['confluence', 'jira']);
    });

    it('should normalize platform names to lowercase', () => {
      const result = parseEnv({ ENABLED_PLATFORMS: 'CONFLUENCE,Jira,SPLUNK' });

      expect(result.ENABLED_PLATFORMS).toEqual(['confluence', 'jira', 'splunk']);
    });

    it('should throw error when no valid platforms enabled', () => {
      expect(() => parseEnv({ ENABLED_PLATFORMS: 'invalid,unknown' })).toThrow(
        'Configuration validation failed'
      );
    });

    it('should coerce PORT to number', () => {
      const result = parseEnv({ PORT: '8080' });

      expect(result.PORT).toBe(8080);
      expect(typeof result.PORT).toBe('number');
    });

    it('should reject invalid PORT', () => {
      expect(() => parseEnv({ PORT: '99999' })).toThrow('Configuration validation failed');
      expect(() => parseEnv({ PORT: '0' })).toThrow('Configuration validation failed');
    });

    it('should coerce SESSION_TIMEOUT_MINUTES to number', () => {
      const result = parseEnv({ SESSION_TIMEOUT_MINUTES: '120' });

      expect(result.SESSION_TIMEOUT_MINUTES).toBe(120);
    });

    it('should reject invalid SESSION_TIMEOUT_MINUTES', () => {
      expect(() => parseEnv({ SESSION_TIMEOUT_MINUTES: '0' })).toThrow(
        'Configuration validation failed'
      );
      expect(() => parseEnv({ SESSION_TIMEOUT_MINUTES: '2000' })).toThrow(
        'Configuration validation failed'
      );
    });

    it('should parse ALLOWED_ORIGINS as comma-separated list', () => {
      const result = parseEnv({
        ALLOWED_ORIGINS: 'https://example.com,https://api.example.com',
      });

      expect(result.ALLOWED_ORIGINS).toEqual(['https://example.com', 'https://api.example.com']);
    });

    it('should trim whitespace from ALLOWED_ORIGINS', () => {
      const result = parseEnv({
        ALLOWED_ORIGINS: '  https://example.com  ,  https://api.example.com  ',
      });

      expect(result.ALLOWED_ORIGINS).toEqual(['https://example.com', 'https://api.example.com']);
    });

    it('should validate REDIS_URL as URL', () => {
      const result = parseEnv({ REDIS_URL: 'redis://myhost:6380' });

      expect(result.REDIS_URL).toBe('redis://myhost:6380');
    });

    it('should validate BASE_URL as URL', () => {
      const result = parseEnv({ BASE_URL: 'https://demo.example.com' });

      expect(result.BASE_URL).toBe('https://demo.example.com');
    });

    it('should accept empty strings for optional credentials', () => {
      const result = parseEnv({
        CLAUDE_CODE_OAUTH_TOKEN: '',
        ANTHROPIC_API_KEY: '',
        CONFLUENCE_API_TOKEN: '',
        JIRA_API_TOKEN: '',
        SPLUNK_PASSWORD: '',
      });

      expect(result.CLAUDE_CODE_OAUTH_TOKEN).toBe('');
      expect(result.ANTHROPIC_API_KEY).toBe('');
    });

    it('should coerce COOKIE_SECURE to boolean', () => {
      expect(parseEnv({ COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
      expect(parseEnv({ COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
      expect(parseEnv({ COOKIE_SECURE: '1' }).COOKIE_SECURE).toBe(true);
      expect(parseEnv({ COOKIE_SECURE: '0' }).COOKIE_SECURE).toBe(false);
    });

    it('should use default NODE_ENV of development', () => {
      const result = parseEnv({});

      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept valid NODE_ENV values', () => {
      expect(parseEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
      expect(parseEnv({ NODE_ENV: 'development' }).NODE_ENV).toBe('development');
      expect(parseEnv({ NODE_ENV: 'test' }).NODE_ENV).toBe('test');
    });

    it('should reject invalid NODE_ENV', () => {
      expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow('Configuration validation failed');
    });

    it('should parse Splunk config with defaults', () => {
      const result = parseEnv({});

      expect(result.SPLUNK_URL).toBe('https://splunk:8089');
      expect(result.SPLUNK_WEB_URL).toBe('http://splunk:8000');
      expect(result.SPLUNK_USERNAME).toBe('admin');
    });

    it('should parse rate limiting config', () => {
      const result = parseEnv({
        RATE_LIMIT_WINDOW_MS: '30000',
        RATE_LIMIT_MAX_CONNECTIONS: '5',
        INVITE_RATE_LIMIT_WINDOW_MS: '1800000',
        INVITE_RATE_LIMIT_MAX_ATTEMPTS: '3',
      });

      expect(result.RATE_LIMIT_WINDOW_MS).toBe(30000);
      expect(result.RATE_LIMIT_MAX_CONNECTIONS).toBe(5);
      expect(result.INVITE_RATE_LIMIT_WINDOW_MS).toBe(1800000);
      expect(result.INVITE_RATE_LIMIT_MAX_ATTEMPTS).toBe(3);
    });
  });

  describe('envSchema', () => {
    it('should be a valid Zod schema', () => {
      expect(envSchema).toBeDefined();
      expect(typeof envSchema.safeParse).toBe('function');
    });

    it('should provide detailed error messages', () => {
      const result = envSchema.safeParse({ PORT: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    });
  });
});
