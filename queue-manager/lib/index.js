/**
 * @demo-platform/queue-manager-core
 *
 * Shared core utilities for demo platform queue managers.
 *
 * This library provides common functionality used across all demo platforms:
 * - jira-demo
 * - confluence-demo
 * - splunk-demo
 *
 * Modules:
 * - session: Session token generation and validation (HMAC-SHA256)
 * - rate-limit: In-memory rate limiting with automatic cleanup
 * - env-file: Secure credential passing via temporary env files
 * - metrics: OpenTelemetry metrics with graceful fallback
 */

const session = require('./session');
const rateLimit = require('./rate-limit');
const envFile = require('./env-file');
const metrics = require('./metrics');

module.exports = {
  // Session token utilities
  generateSessionToken: session.generateSessionToken,
  validateSessionToken: session.validateSessionToken,
  isSessionTokenExpired: session.isSessionTokenExpired,

  // Rate limiting
  createRateLimiter: rateLimit.createRateLimiter,
  createConnectionRateLimiter: rateLimit.createConnectionRateLimiter,
  createInviteRateLimiter: rateLimit.createInviteRateLimiter,

  // Env file management
  createSessionEnvFile: envFile.createSessionEnvFile,
  createEnvFileManager: envFile.createEnvFileManager,

  // Metrics
  createMetrics: metrics.createMetrics,
  createSpanUtils: metrics.createSpanUtils
};
