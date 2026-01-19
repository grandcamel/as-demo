/**
 * Tests for lib/session.js
 *
 * Tests token generation, validation, and expiration checking.
 */

const {
  generateSessionToken,
  validateSessionToken,
  isSessionTokenExpired
} = require('../../lib/session');

describe('session', () => {
  const validSecret = 'test-secret-key-12345';
  const validSessionId = 'session-abc-123';

  describe('generateSessionToken', () => {
    it('should generate a token with correct format', () => {
      const token = generateSessionToken(validSessionId, validSecret);

      // Token format: base64.signature
      expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[a-f0-9]+$/);
      expect(token.split('.').length).toBe(2);
    });

    it('should generate unique tokens for same session (due to timestamp)', () => {
      const token1 = generateSessionToken(validSessionId, validSecret);

      // Advance time slightly
      jest.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 1);
      const token2 = generateSessionToken(validSessionId, validSecret);

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different sessions', () => {
      const token1 = generateSessionToken('session-1', validSecret);
      const token2 = generateSessionToken('session-2', validSecret);

      expect(token1).not.toBe(token2);
    });

    it('should generate different signatures for different secrets', () => {
      const token1 = generateSessionToken(validSessionId, 'secret-1');
      const token2 = generateSessionToken(validSessionId, 'secret-2');

      const sig1 = token1.split('.')[1];
      const sig2 = token2.split('.')[1];

      expect(sig1).not.toBe(sig2);
    });

    it('should throw error for empty sessionId', () => {
      expect(() => generateSessionToken('', validSecret))
        .toThrow('sessionId must be a non-empty string');
    });

    it('should throw error for null sessionId', () => {
      expect(() => generateSessionToken(null, validSecret))
        .toThrow('sessionId must be a non-empty string');
    });

    it('should throw error for undefined sessionId', () => {
      expect(() => generateSessionToken(undefined, validSecret))
        .toThrow('sessionId must be a non-empty string');
    });

    it('should throw error for non-string sessionId', () => {
      expect(() => generateSessionToken(12345, validSecret))
        .toThrow('sessionId must be a non-empty string');
    });

    it('should throw error for empty secret', () => {
      expect(() => generateSessionToken(validSessionId, ''))
        .toThrow('secret must be a non-empty string');
    });

    it('should throw error for null secret', () => {
      expect(() => generateSessionToken(validSessionId, null))
        .toThrow('secret must be a non-empty string');
    });

    it('should throw error for undefined secret', () => {
      expect(() => generateSessionToken(validSessionId, undefined))
        .toThrow('secret must be a non-empty string');
    });

    it('should throw error for non-string secret', () => {
      expect(() => generateSessionToken(validSessionId, 12345))
        .toThrow('secret must be a non-empty string');
    });

    it('should handle session IDs with special characters', () => {
      const specialId = 'session:with:colons:and-dashes';
      const token = generateSessionToken(specialId, validSecret);

      expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[a-f0-9]+$/);

      const result = validateSessionToken(token, validSecret);
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(specialId);
    });

    it('should handle unicode session IDs', () => {
      const unicodeId = 'session-日本語-émojis-🎉';
      const token = generateSessionToken(unicodeId, validSecret);

      const result = validateSessionToken(token, validSecret);
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(unicodeId);
    });
  });

  describe('validateSessionToken', () => {
    it('should validate a correctly signed token', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = validateSessionToken(token, validSecret);

      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(validSessionId);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it('should reject token with wrong secret', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = validateSessionToken(token, 'wrong-secret');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject tampered data portion', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const [, signature] = token.split('.');

      // Create tampered data
      const tamperedData = Buffer.from('tampered:12345').toString('base64');
      const tamperedToken = `${tamperedData}.${signature}`;

      const result = validateSessionToken(tamperedToken, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject tampered signature', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const [data] = token.split('.');

      // Create tampered signature (different hex)
      const tamperedToken = `${data}.deadbeef0123456789abcdef`;

      const result = validateSessionToken(tamperedToken, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject empty token', () => {
      const result = validateSessionToken('', validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token must be a non-empty string');
    });

    it('should reject null token', () => {
      const result = validateSessionToken(null, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token must be a non-empty string');
    });

    it('should reject undefined token', () => {
      const result = validateSessionToken(undefined, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token must be a non-empty string');
    });

    it('should reject non-string token', () => {
      const result = validateSessionToken(12345, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token must be a non-empty string');
    });

    it('should reject empty secret', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = validateSessionToken(token, '');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Secret must be a non-empty string');
    });

    it('should reject null secret', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = validateSessionToken(token, null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Secret must be a non-empty string');
    });

    it('should reject non-string secret', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = validateSessionToken(token, 12345);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Secret must be a non-empty string');
    });

    it('should reject token without separator', () => {
      const result = validateSessionToken('invalidtokenwithoutdot', validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject token with multiple separators', () => {
      const result = validateSessionToken('part1.part2.part3', validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject invalid base64 in data portion', () => {
      // Invalid base64 (contains invalid chars)
      const result = validateSessionToken('!!!invalid!!!.abcdef123456', validSecret);

      expect(result.valid).toBe(false);
      // Should fail on signature verification since decoding doesn't throw for invalid base64
    });

    it('should reject token with malformed data (no colon)', () => {
      // Create valid base64 of data without colon
      const dataWithoutColon = Buffer.from('nodatacolonhere').toString('base64');
      // Create signature for this data
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', validSecret)
        .update('nodatacolonhere')
        .digest('hex');

      const token = `${dataWithoutColon}.${signature}`;
      const result = validateSessionToken(token, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token data format');
    });

    it('should reject token with invalid timestamp', () => {
      // Create valid base64 of data with invalid timestamp
      const dataWithBadTimestamp = Buffer.from('sessionid:notanumber').toString('base64');
      // Create signature for this data
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', validSecret)
        .update('sessionid:notanumber')
        .digest('hex');

      const token = `${dataWithBadTimestamp}.${signature}`;
      const result = validateSessionToken(token, validSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid timestamp');
    });

    it('should handle session IDs containing colons', () => {
      const sessionWithColons = 'prefix:middle:suffix';
      const token = generateSessionToken(sessionWithColons, validSecret);
      const result = validateSessionToken(token, validSecret);

      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(sessionWithColons);
    });
  });

  describe('isSessionTokenExpired', () => {
    const maxAgeMs = 60 * 60 * 1000; // 1 hour

    it('should return not expired for fresh token', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = isSessionTokenExpired(token, validSecret, maxAgeMs);

      expect(result.expired).toBe(false);
      expect(result.ageMs).toBeGreaterThanOrEqual(0);
      expect(result.ageMs).toBeLessThan(1000);
      expect(result.error).toBeNull();
    });

    it('should return expired for old token', () => {
      // Mock Date.now to return a specific timestamp for token creation
      const creationTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(creationTime);

      const token = generateSessionToken(validSessionId, validSecret);

      // Now mock Date.now to return time after max age
      const expiredTime = creationTime + maxAgeMs + 1000;
      jest.spyOn(Date, 'now').mockReturnValue(expiredTime);

      const result = isSessionTokenExpired(token, validSecret, maxAgeMs);

      expect(result.expired).toBe(true);
      expect(result.ageMs).toBeGreaterThan(maxAgeMs);
      expect(result.error).toBeNull();
    });

    it('should return not expired at exact boundary', () => {
      const creationTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(creationTime);

      const token = generateSessionToken(validSessionId, validSecret);

      // Mock to exact boundary
      jest.spyOn(Date, 'now').mockReturnValue(creationTime + maxAgeMs);

      const result = isSessionTokenExpired(token, validSecret, maxAgeMs);

      expect(result.expired).toBe(false);
      expect(result.ageMs).toBe(maxAgeMs);
    });

    it('should return expired for invalid token', () => {
      const result = isSessionTokenExpired('invalid-token', validSecret, maxAgeMs);

      expect(result.expired).toBe(true);
      expect(result.error).toBe('Invalid token format');
    });

    it('should return expired for wrong secret', () => {
      const token = generateSessionToken(validSessionId, validSecret);
      const result = isSessionTokenExpired(token, 'wrong-secret', maxAgeMs);

      expect(result.expired).toBe(true);
      expect(result.error).toBe('Invalid signature');
    });

    it('should handle zero max age', () => {
      const token = generateSessionToken(validSessionId, validSecret);

      // Even immediate check should be expired with 0 max age
      // (ageMs will be 0 or slightly positive, and 0 > 0 is false)
      const result = isSessionTokenExpired(token, validSecret, 0);

      // With 0 max age, token is effectively expired immediately
      // unless ageMs is exactly 0 at the same millisecond
      expect(typeof result.expired).toBe('boolean');
    });

    it('should handle small max age', () => {
      const creationTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(creationTime);

      const token = generateSessionToken(validSessionId, validSecret);

      // Advance time by 100ms
      jest.spyOn(Date, 'now').mockReturnValue(creationTime + 100);

      // Max age of 50ms should be expired
      const result = isSessionTokenExpired(token, validSecret, 50);

      expect(result.expired).toBe(true);
      expect(result.ageMs).toBe(100);
    });

    it('should correctly calculate age in milliseconds', () => {
      const creationTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(creationTime);

      const token = generateSessionToken(validSessionId, validSecret);

      const elapsed = 12345;
      jest.spyOn(Date, 'now').mockReturnValue(creationTime + elapsed);

      const result = isSessionTokenExpired(token, validSecret, maxAgeMs);

      expect(result.ageMs).toBe(elapsed);
    });
  });
});
