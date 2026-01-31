/**
 * Zod schemas for environment configuration validation.
 *
 * Provides type-safe configuration with clear error messages.
 */

const { z } = require('zod');

// Valid platform names
const VALID_PLATFORMS = ['confluence', 'jira', 'splunk'];

// Server configuration schema
const serverSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  BASE_URL: z.string().url().default('http://localhost:8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Session configuration schema
const sessionSchema = z.object({
  SESSION_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  MAX_QUEUE_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  SESSION_SECRET: z.string().min(1).default('change-me-in-production'),
  SESSION_ENV_HOST_PATH: z.string().default('/tmp/session-env'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
});

// Rate limiting schema
const rateLimitSchema = z.object({
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(10),
  INVITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(3600000),
  INVITE_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
});

// Claude authentication schema
const claudeSchema = z.object({
  CLAUDE_CODE_OAUTH_TOKEN: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
});

// Platform enablement schema
const platformEnablementSchema = z.object({
  ENABLED_PLATFORMS: z
    .string()
    .default('confluence,jira,splunk')
    .transform((val) =>
      val
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter((p) => VALID_PLATFORMS.includes(p))
    )
    .refine((platforms) => platforms.length > 0, {
      message: `No valid platforms enabled. Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
    }),
});

// Confluence platform schema
const confluenceSchema = z.object({
  CONFLUENCE_API_TOKEN: z.string().default(''),
  CONFLUENCE_EMAIL: z.string().email().or(z.literal('')).default(''),
  CONFLUENCE_SITE_URL: z.string().url().or(z.literal('')).default(''),
  DEMO_SPACE_KEY: z.string().default('CDEMO'),
});

// JIRA platform schema
const jiraSchema = z.object({
  JIRA_API_TOKEN: z.string().default(''),
  JIRA_EMAIL: z.string().email().or(z.literal('')).default(''),
  JIRA_SITE_URL: z.string().url().or(z.literal('')).default(''),
  DEMO_PROJECT_KEY: z.string().default('DEMO'),
});

// Splunk platform schema
const splunkSchema = z.object({
  SPLUNK_URL: z.string().url().default('https://splunk:8089'),
  SPLUNK_WEB_URL: z.string().url().default('http://splunk:8000'),
  SPLUNK_USERNAME: z.string().default('admin'),
  SPLUNK_PASSWORD: z.string().default(''),
  SPLUNK_HEC_TOKEN: z.string().default(''),
});

// Container configuration schema
const containerSchema = z.object({
  DEMO_CONTAINER_IMAGE: z.string().default('as-demo-container:latest'),
  SCENARIOS_PATH: z.string().default('/opt/demo-container/scenarios'),
});

// CORS configuration schema
const corsSchema = z.object({
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((o) => o.trim()) : [])),
});

// Combined environment schema
const envSchema = serverSchema
  .merge(sessionSchema)
  .merge(rateLimitSchema)
  .merge(claudeSchema)
  .merge(platformEnablementSchema)
  .merge(confluenceSchema)
  .merge(jiraSchema)
  .merge(splunkSchema)
  .merge(containerSchema)
  .merge(corsSchema);

/**
 * Parse and validate environment variables.
 * @param {Object} env - Environment variables (defaults to process.env)
 * @returns {Object} Validated configuration
 * @throws {Error} If validation fails
 */
function parseEnv(env = process.env) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Get a formatted validation error message.
 * @param {Object} error - Zod error object
 * @returns {string} Formatted error message
 */
function formatValidationError(error) {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
}

module.exports = {
  VALID_PLATFORMS,
  envSchema,
  serverSchema,
  sessionSchema,
  rateLimitSchema,
  claudeSchema,
  platformEnablementSchema,
  confluenceSchema,
  jiraSchema,
  splunkSchema,
  containerSchema,
  corsSchema,
  parseEnv,
  formatValidationError,
};
