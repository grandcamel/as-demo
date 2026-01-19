/**
 * Session token utilities for demo platform queue managers.
 *
 * Provides secure session token generation and validation using HMAC-SHA256.
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically secure session token.
 *
 * Token format: base64(sessionId:timestamp).signature
 * - sessionId: UUID or other unique identifier
 * - timestamp: Unix timestamp in milliseconds
 * - signature: HMAC-SHA256 of the data portion
 *
 * @param {string} sessionId - Unique session identifier
 * @param {string} secret - Secret key for HMAC signing
 * @returns {string} Signed session token
 *
 * @example
 * const token = generateSessionToken('abc-123', 'my-secret');
 * // Returns: "YWJjLTEyMzoxNzA1MDAwMDAwMDAw.a1b2c3d4..."
 */
function generateSessionToken(sessionId, secret) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('secret must be a non-empty string');
  }

  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return `${Buffer.from(data).toString('base64')}.${signature}`;
}

/**
 * Validate a session token's signature.
 *
 * @param {string} token - Session token to validate
 * @param {string} secret - Secret key used to sign the token
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether the token signature is valid
 * @returns {string|null} result.sessionId - Extracted session ID (if valid)
 * @returns {number|null} result.timestamp - Token creation timestamp (if valid)
 * @returns {string|null} result.error - Error message (if invalid)
 *
 * @example
 * const result = validateSessionToken(token, 'my-secret');
 * if (result.valid) {
 *   console.log('Session ID:', result.sessionId);
 * }
 */
function validateSessionToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token must be a non-empty string' };
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, error: 'Secret must be a non-empty string' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid token format' };
  }

  const [encodedData, signature] = parts;

  let data;
  try {
    data = Buffer.from(encodedData, 'base64').toString('utf8');
  } catch (_err) {
    return { valid: false, error: 'Invalid base64 encoding' };
  }

  // Verify signature using timing-safe comparison
  const expectedSignature = crypto.createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Parse data
  const colonIndex = data.lastIndexOf(':');
  if (colonIndex === -1) {
    return { valid: false, error: 'Invalid token data format' };
  }

  const sessionId = data.slice(0, colonIndex);
  const timestamp = parseInt(data.slice(colonIndex + 1), 10);

  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  return {
    valid: true,
    sessionId,
    timestamp,
    error: null
  };
}

/**
 * Check if a session token has expired.
 *
 * @param {string} token - Session token to check
 * @param {string} secret - Secret key used to sign the token
 * @param {number} maxAgeMs - Maximum token age in milliseconds
 * @returns {Object} Expiration check result
 * @returns {boolean} result.expired - Whether the token has expired
 * @returns {number|null} result.ageMs - Token age in milliseconds (if valid)
 * @returns {string|null} result.error - Error message (if invalid)
 */
function isSessionTokenExpired(token, secret, maxAgeMs) {
  const validation = validateSessionToken(token, secret);

  if (!validation.valid) {
    return { expired: true, error: validation.error };
  }

  const ageMs = Date.now() - validation.timestamp;

  return {
    expired: ageMs > maxAgeMs,
    ageMs,
    error: null
  };
}

module.exports = {
  generateSessionToken,
  validateSessionToken,
  isSessionTokenExpired
};
