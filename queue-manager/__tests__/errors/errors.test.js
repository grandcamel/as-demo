/**
 * Tests for errors/index.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('errors module', () => {
  let errors;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear require cache to get fresh module
    const errorPath = require.resolve('../../errors');
    delete require.cache[errorPath];

    errors = require('../../errors');
  });

  describe('ErrorCodes', () => {
    it('should export all error code categories', () => {
      const { ErrorCodes } = errors;

      // Validation errors
      expect(ErrorCodes.INVALID_CONFIG).toBe('ERR_INVALID_CONFIG');
      expect(ErrorCodes.INVALID_INPUT).toBe('ERR_INVALID_INPUT');
      expect(ErrorCodes.INVALID_MESSAGE_FORMAT).toBe('ERR_INVALID_MESSAGE_FORMAT');

      // Auth errors
      expect(ErrorCodes.UNAUTHORIZED).toBe('ERR_UNAUTHORIZED');
      expect(ErrorCodes.NO_SESSION_COOKIE).toBe('ERR_NO_SESSION_COOKIE');
      expect(ErrorCodes.INVALID_TOKEN).toBe('ERR_INVALID_TOKEN');
      expect(ErrorCodes.SESSION_NOT_ACTIVE).toBe('ERR_SESSION_NOT_ACTIVE');

      // Invite errors
      expect(ErrorCodes.INVITE_MISSING).toBe('ERR_INVITE_MISSING');
      expect(ErrorCodes.INVITE_INVALID).toBe('ERR_INVITE_INVALID');
      expect(ErrorCodes.INVITE_NOT_FOUND).toBe('ERR_INVITE_NOT_FOUND');
      expect(ErrorCodes.INVITE_EXPIRED).toBe('ERR_INVITE_EXPIRED');
      expect(ErrorCodes.INVITE_USED).toBe('ERR_INVITE_USED');
      expect(ErrorCodes.INVITE_REVOKED).toBe('ERR_INVITE_REVOKED');

      // Rate limiting errors
      expect(ErrorCodes.RATE_LIMITED).toBe('ERR_RATE_LIMITED');
      expect(ErrorCodes.RATE_LIMITED_CONNECTION).toBe('ERR_RATE_LIMITED_CONNECTION');
      expect(ErrorCodes.RATE_LIMITED_INVITE).toBe('ERR_RATE_LIMITED_INVITE');

      // Queue errors
      expect(ErrorCodes.QUEUE_FULL).toBe('ERR_QUEUE_FULL');
      expect(ErrorCodes.ALREADY_IN_QUEUE).toBe('ERR_ALREADY_IN_QUEUE');
      expect(ErrorCodes.RECONNECTION_IN_PROGRESS).toBe('ERR_RECONNECTION_IN_PROGRESS');

      // Session errors
      expect(ErrorCodes.SESSION_NOT_FOUND).toBe('ERR_SESSION_NOT_FOUND');
      expect(ErrorCodes.SESSION_SPAWN_FAILED).toBe('ERR_SESSION_SPAWN_FAILED');
      expect(ErrorCodes.SESSION_START_FAILED).toBe('ERR_SESSION_START_FAILED');
      expect(ErrorCodes.SESSION_TIMEOUT).toBe('ERR_SESSION_TIMEOUT');

      // WebSocket errors
      expect(ErrorCodes.ORIGIN_REQUIRED).toBe('ERR_ORIGIN_REQUIRED');
      expect(ErrorCodes.ORIGIN_NOT_ALLOWED).toBe('ERR_ORIGIN_NOT_ALLOWED');
      expect(ErrorCodes.UNKNOWN_MESSAGE_TYPE).toBe('ERR_UNKNOWN_MESSAGE_TYPE');

      // Infrastructure errors
      expect(ErrorCodes.REDIS_ERROR).toBe('ERR_REDIS_ERROR');
      expect(ErrorCodes.FILE_ERROR).toBe('ERR_FILE_ERROR');
      expect(ErrorCodes.CONTENT_TYPE_ERROR).toBe('ERR_CONTENT_TYPE_ERROR');

      // Generic errors
      expect(ErrorCodes.INTERNAL_ERROR).toBe('ERR_INTERNAL');
    });
  });

  describe('DemoError', () => {
    it('should create error with code and message', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Invalid input');

      expect(error.name).toBe('DemoError');
      expect(error.code).toBe('ERR_INVALID_INPUT');
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(500); // default
      expect(error.details).toEqual({});
    });

    it('should accept custom statusCode', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Bad request', { statusCode: 400 });

      expect(error.statusCode).toBe(400);
    });

    it('should accept details', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Invalid field', {
        details: { field: 'email', expected: 'string' }
      });

      expect(error.details).toEqual({ field: 'email', expected: 'string' });
    });

    it('should serialize to JSON correctly', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Bad input', {
        details: { field: 'token' }
      });

      expect(error.toJSON()).toEqual({
        code: 'ERR_INVALID_INPUT',
        message: 'Bad input',
        details: { field: 'token' }
      });
    });

    it('should omit empty details in JSON', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Bad input');

      expect(error.toJSON()).toEqual({
        code: 'ERR_INVALID_INPUT',
        message: 'Bad input'
      });
    });

    it('should be instanceof Error', () => {
      const { DemoError, ErrorCodes } = errors;

      const error = new DemoError(ErrorCodes.INVALID_INPUT, 'Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DemoError).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('should have statusCode 400', () => {
      const { ValidationError, ErrorCodes } = errors;

      const error = new ValidationError(ErrorCodes.INVALID_INPUT, 'Invalid input');

      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
    });

    it('should accept details', () => {
      const { ValidationError, ErrorCodes } = errors;

      const error = new ValidationError(ErrorCodes.INVALID_INPUT, 'Invalid', { field: 'email' });

      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('AuthError', () => {
    it('should have statusCode 401', () => {
      const { AuthError, ErrorCodes } = errors;

      const error = new AuthError(ErrorCodes.UNAUTHORIZED, 'Unauthorized');

      expect(error.name).toBe('AuthError');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('RateLimitError', () => {
    it('should have statusCode 429', () => {
      const { RateLimitError, ErrorCodes } = errors;

      const error = new RateLimitError(ErrorCodes.RATE_LIMITED, 'Too many requests', {
        retryAfter: 60
      });

      expect(error.name).toBe('RateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('NotFoundError', () => {
    it('should have statusCode 404', () => {
      const { NotFoundError, ErrorCodes } = errors;

      const error = new NotFoundError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found');

      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('SessionError', () => {
    it('should have statusCode 500', () => {
      const { SessionError, ErrorCodes } = errors;

      const error = new SessionError(ErrorCodes.SESSION_SPAWN_FAILED, 'Failed to spawn');

      expect(error.name).toBe('SessionError');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('QueueError', () => {
    it('should have default statusCode 409', () => {
      const { QueueError, ErrorCodes } = errors;

      const error = new QueueError(ErrorCodes.ALREADY_IN_QUEUE, 'Already in queue');

      expect(error.name).toBe('QueueError');
      expect(error.statusCode).toBe(409);
    });

    it('should accept custom statusCode', () => {
      const { QueueError, ErrorCodes } = errors;

      const error = new QueueError(ErrorCodes.QUEUE_FULL, 'Queue is full', { statusCode: 503 });

      expect(error.statusCode).toBe(503);
    });
  });

  describe('ContentTypeError', () => {
    it('should have statusCode 415 and default message', () => {
      const { ContentTypeError, ErrorCodes } = errors;

      const error = new ContentTypeError();

      expect(error.name).toBe('ContentTypeError');
      expect(error.code).toBe(ErrorCodes.CONTENT_TYPE_ERROR);
      expect(error.statusCode).toBe(415);
      expect(error.message).toBe('Content-Type must be application/json');
    });

    it('should accept custom message', () => {
      const { ContentTypeError } = errors;

      const error = new ContentTypeError('Expected JSON');

      expect(error.message).toBe('Expected JSON');
    });
  });

  describe('WebSocketError', () => {
    it('should have default closeCode 1008', () => {
      const { WebSocketError, ErrorCodes } = errors;

      const error = new WebSocketError(ErrorCodes.ORIGIN_REQUIRED, 'Origin required');

      expect(error.name).toBe('WebSocketError');
      expect(error.closeCode).toBe(1008);
      expect(error.statusCode).toBe(400);
    });

    it('should accept custom closeCode', () => {
      const { WebSocketError, ErrorCodes } = errors;

      const error = new WebSocketError(ErrorCodes.RATE_LIMITED_CONNECTION, 'Rate limited', {
        closeCode: 1013
      });

      expect(error.closeCode).toBe(1013);
    });
  });

  describe('errorHandler middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      mockNext = vi.fn();
    });

    it('should handle DemoError instances', () => {
      const { errorHandler, ValidationError, ErrorCodes } = errors;
      const error = new ValidationError(ErrorCodes.INVALID_INPUT, 'Bad input');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 'ERR_INVALID_INPUT',
        message: 'Bad input'
      });
    });

    it('should handle generic errors in production', () => {
      const { errorHandler } = errors;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Internal details');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 'ERR_INTERNAL',
        message: 'Internal server error'
      });
      expect(consoleSpy).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should expose error message in development', () => {
      const { errorHandler } = errors;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Detailed error message');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        code: 'ERR_INTERNAL',
        message: 'Detailed error message'
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('formatWsError', () => {
    it('should format error as JSON string', () => {
      const { formatWsError, ErrorCodes } = errors;

      const result = formatWsError(ErrorCodes.INVALID_MESSAGE_FORMAT, 'Bad format');
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        type: 'error',
        code: 'ERR_INVALID_MESSAGE_FORMAT',
        message: 'Bad format'
      });
    });

    it('should include details when provided', () => {
      const { formatWsError, ErrorCodes } = errors;

      const result = formatWsError(ErrorCodes.RATE_LIMITED, 'Rate limited', { retryAfter: 60 });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        type: 'error',
        code: 'ERR_RATE_LIMITED',
        message: 'Rate limited',
        details: { retryAfter: 60 }
      });
    });

    it('should omit empty details', () => {
      const { formatWsError, ErrorCodes } = errors;

      const result = formatWsError(ErrorCodes.UNKNOWN_MESSAGE_TYPE, 'Unknown type', {});
      const parsed = JSON.parse(result);

      expect(parsed.details).toBeUndefined();
    });
  });

  describe('formatWsCloseReason', () => {
    it('should format close reason', () => {
      const { formatWsCloseReason, ErrorCodes } = errors;

      const result = formatWsCloseReason(ErrorCodes.ORIGIN_REQUIRED, 'Origin required');

      expect(result).toBe('ERR_ORIGIN_REQUIRED: Origin required');
    });

    it('should truncate long reasons to 123 bytes', () => {
      const { formatWsCloseReason, ErrorCodes } = errors;
      const longMessage = 'A'.repeat(150);

      const result = formatWsCloseReason(ErrorCodes.INTERNAL_ERROR, longMessage);

      expect(result.length).toBe(123);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short reasons', () => {
      const { formatWsCloseReason, ErrorCodes } = errors;

      const result = formatWsCloseReason(ErrorCodes.RATE_LIMITED, 'Retry in 60s');

      expect(result).toBe('ERR_RATE_LIMITED: Retry in 60s');
      expect(result.length).toBeLessThan(123);
    });
  });
});
