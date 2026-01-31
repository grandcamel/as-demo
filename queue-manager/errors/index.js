// @ts-check
/**
 * Centralized error handling module.
 *
 * Provides typed error classes with error codes for consistent
 * API responses and better debugging.
 */

/**
 * Error codes registry.
 * Grouped by category for easy discovery.
 */
const ErrorCodes = {
  // Validation errors
  INVALID_CONFIG: 'ERR_INVALID_CONFIG',
  INVALID_INPUT: 'ERR_INVALID_INPUT',
  INVALID_MESSAGE_FORMAT: 'ERR_INVALID_MESSAGE_FORMAT',

  // Authentication/Authorization errors
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  NO_SESSION_COOKIE: 'ERR_NO_SESSION_COOKIE',
  INVALID_TOKEN: 'ERR_INVALID_TOKEN',
  SESSION_NOT_ACTIVE: 'ERR_SESSION_NOT_ACTIVE',

  // Invite errors
  INVITE_MISSING: 'ERR_INVITE_MISSING',
  INVITE_INVALID: 'ERR_INVITE_INVALID',
  INVITE_NOT_FOUND: 'ERR_INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'ERR_INVITE_EXPIRED',
  INVITE_USED: 'ERR_INVITE_USED',
  INVITE_REVOKED: 'ERR_INVITE_REVOKED',

  // Rate limiting errors
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  RATE_LIMITED_CONNECTION: 'ERR_RATE_LIMITED_CONNECTION',
  RATE_LIMITED_INVITE: 'ERR_RATE_LIMITED_INVITE',

  // Queue errors
  QUEUE_FULL: 'ERR_QUEUE_FULL',
  ALREADY_IN_QUEUE: 'ERR_ALREADY_IN_QUEUE',
  RECONNECTION_IN_PROGRESS: 'ERR_RECONNECTION_IN_PROGRESS',

  // Session errors
  SESSION_NOT_FOUND: 'ERR_SESSION_NOT_FOUND',
  SESSION_SPAWN_FAILED: 'ERR_SESSION_SPAWN_FAILED',
  SESSION_START_FAILED: 'ERR_SESSION_START_FAILED',
  SESSION_TIMEOUT: 'ERR_SESSION_TIMEOUT',

  // WebSocket errors
  ORIGIN_REQUIRED: 'ERR_ORIGIN_REQUIRED',
  ORIGIN_NOT_ALLOWED: 'ERR_ORIGIN_NOT_ALLOWED',
  UNKNOWN_MESSAGE_TYPE: 'ERR_UNKNOWN_MESSAGE_TYPE',

  // Infrastructure errors
  REDIS_ERROR: 'ERR_REDIS_ERROR',
  FILE_ERROR: 'ERR_FILE_ERROR',
  CONTENT_TYPE_ERROR: 'ERR_CONTENT_TYPE_ERROR',

  // Generic errors
  INTERNAL_ERROR: 'ERR_INTERNAL',
};

/**
 * Base error class for all demo platform errors.
 * Provides consistent error structure with code, message, and details.
 */
class DemoError extends Error {
  /**
   * @param {string} code - Error code from ErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object} [options] - Additional options
   * @param {number} [options.statusCode] - HTTP status code (default: 500)
   * @param {Object} [options.details] - Additional error details
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'DemoError';
    this.code = code;
    this.statusCode = options.statusCode || 500;
    this.details = options.details || {};
  }

  /**
   * Convert error to JSON-serializable object.
   * @returns {Object} JSON representation
   */
  toJSON() {
    const json = {
      code: this.code,
      message: this.message,
    };
    if (Object.keys(this.details).length > 0) {
      json.details = this.details;
    }
    return json;
  }
}

/**
 * Validation error (400 Bad Request).
 * Use for malformed input, missing required fields, etc.
 */
class ValidationError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [details] - Validation details (e.g., field errors)
   */
  constructor(code, message, details = {}) {
    super(code, message, { statusCode: 400, details });
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401 Unauthorized).
 * Use for missing/invalid credentials, expired tokens, etc.
 */
class AuthError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [details] - Auth details (e.g., reason)
   */
  constructor(code, message, details = {}) {
    super(code, message, { statusCode: 401, details });
    this.name = 'AuthError';
  }
}

/**
 * Rate limit error (429 Too Many Requests).
 * Use when request rate exceeds allowed limits.
 */
class RateLimitError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [details] - Rate limit details (e.g., retryAfter)
   */
  constructor(code, message, details = {}) {
    super(code, message, { statusCode: 429, details });
    this.name = 'RateLimitError';
  }
}

/**
 * Not found error (404 Not Found).
 * Use when requested resource doesn't exist.
 */
class NotFoundError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [details] - Additional details
   */
  constructor(code, message, details = {}) {
    super(code, message, { statusCode: 404, details });
    this.name = 'NotFoundError';
  }
}

/**
 * Session error (500 Internal Server Error).
 * Use for session-related failures.
 */
class SessionError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [details] - Session details
   */
  constructor(code, message, details = {}) {
    super(code, message, { statusCode: 500, details });
    this.name = 'SessionError';
  }
}

/**
 * Queue error (409 Conflict or 503 Service Unavailable).
 * Use for queue-related failures.
 */
class QueueError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [options] - Additional options
   * @param {number} [options.statusCode] - HTTP status code (default: 409)
   * @param {Object} [options.details] - Additional details
   */
  constructor(code, message, options = {}) {
    super(code, message, { statusCode: options.statusCode || 409, details: options.details });
    this.name = 'QueueError';
  }
}

/**
 * Content type error (415 Unsupported Media Type).
 * Use when request content type is invalid.
 */
class ContentTypeError extends DemoError {
  /**
   * @param {string} message - Error message
   */
  constructor(message = 'Content-Type must be application/json') {
    super(ErrorCodes.CONTENT_TYPE_ERROR, message, { statusCode: 415 });
    this.name = 'ContentTypeError';
  }
}

/**
 * WebSocket error.
 * Includes close code for WebSocket connections.
 */
class WebSocketError extends DemoError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [options] - Additional options
   * @param {number} [options.closeCode] - WebSocket close code (default: 1008)
   * @param {Object} [options.details] - Additional details
   */
  constructor(code, message, options = {}) {
    super(code, message, { statusCode: 400, details: options.details });
    this.name = 'WebSocketError';
    this.closeCode = options.closeCode || 1008; // Policy Violation
  }
}

/**
 * Express error handler middleware.
 * Converts DemoError instances to proper HTTP responses.
 *
 * @param {Error} err - Error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  if (err instanceof DemoError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Log unexpected errors
  console.error('Unhandled error:', err);

  // Don't leak internal error details in production
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  return res.status(500).json({
    code: ErrorCodes.INTERNAL_ERROR,
    message,
  });
}

/**
 * Format a WebSocket error message.
 * Returns a JSON string suitable for ws.send().
 *
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} [details] - Additional details
 * @returns {string} JSON string
 */
function formatWsError(code, message, details = {}) {
  const error = { type: 'error', code, message };
  if (Object.keys(details).length > 0) {
    error.details = details;
  }
  return JSON.stringify(error);
}

/**
 * Create a WebSocket close reason string.
 * WebSocket close reasons have a max length of 123 bytes.
 *
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {string} Close reason (truncated if needed)
 */
function formatWsCloseReason(code, message) {
  const reason = `${code}: ${message}`;
  // WebSocket close reason max is 123 bytes
  if (reason.length > 123) {
    return reason.slice(0, 120) + '...';
  }
  return reason;
}

module.exports = {
  // Error codes
  ErrorCodes,

  // Error classes
  DemoError,
  ValidationError,
  AuthError,
  RateLimitError,
  NotFoundError,
  SessionError,
  QueueError,
  ContentTypeError,
  WebSocketError,

  // Middleware and utilities
  errorHandler,
  formatWsError,
  formatWsCloseReason,
};
