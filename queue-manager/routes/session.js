/**
 * Session management routes.
 */

const config = require('../config');
const state = require('../services/state');
const { checkInviteRateLimit, recordFailedInviteAttempt, validateInvite } = require('../services/invite');
const {
  ErrorCodes,
  AuthError,
  ValidationError,
  RateLimitError,
} = require('../errors');

/**
 * Register session routes.
 * @param {Express} app - Express application
 * @param {Object} redis - Redis client
 */
function register(app, redis) {
  // Session validation endpoint (used by nginx auth_request for Grafana)
  app.get('/api/session/validate', (req, res) => {
    const sessionCookie = req.cookies.demo_session;

    if (!sessionCookie) {
      const error = new AuthError(
        ErrorCodes.NO_SESSION_COOKIE,
        'No session cookie'
      );
      return res.status(error.statusCode).json(error.toJSON());
    }

    const activeSession = state.getActiveSession();

    // Check active session token first
    const sessionId = state.sessionTokens.get(sessionCookie);
    if (sessionId && activeSession && activeSession.sessionId === sessionId) {
      res.set('X-Grafana-User', `demo-${sessionId.slice(0, 8)}`);
      return res.status(200).json({ valid: true });
    }

    // Check pending session token (user in queue or session starting)
    const pending = state.pendingSessionTokens.get(sessionCookie);
    if (pending) {
      res.set('X-Grafana-User', `demo-${pending.clientId.slice(0, 8)}`);
      return res.status(200).json({ valid: true });
    }

    // Clean up stale token if it was in sessionTokens
    if (state.sessionTokens.has(sessionCookie)) {
      state.sessionTokens.delete(sessionCookie);
    }

    const error = new AuthError(
      ErrorCodes.SESSION_NOT_ACTIVE,
      'Session not active'
    );
    return res.status(error.statusCode).json(error.toJSON());
  });

  // Set session cookie with secure attributes
  app.post('/api/session/cookie', (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      const error = new ValidationError(
        ErrorCodes.INVALID_INPUT,
        'Token required',
        { field: 'token' }
      );
      return res.status(error.statusCode).json(error.toJSON());
    }

    // Verify token is valid (either active or pending)
    const isActiveToken = state.sessionTokens.has(token);
    const isPendingToken = state.pendingSessionTokens.has(token);

    if (!isActiveToken && !isPendingToken) {
      const error = new AuthError(
        ErrorCodes.INVALID_TOKEN,
        'Invalid token'
      );
      return res.status(error.statusCode).json(error.toJSON());
    }

    // Set secure cookie
    res.cookie('demo_session', token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      maxAge: config.SESSION_TIMEOUT_MINUTES * 60 * 1000,
      path: '/'
    });

    res.json({ success: true });
  });

  // Clear session cookie endpoint
  app.post('/api/session/logout', (req, res) => {
    res.clearCookie('demo_session', {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/'
    });
    res.json({ success: true });
  });

  // Invite validation endpoint (used by nginx auth_request)
  app.get('/api/invite/validate', async (req, res) => {
    // Token comes from X-Invite-Token header (set by nginx from path) or query param
    const token = req.headers['x-invite-token'] || req.query.token;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    // Check rate limit before validating (brute-force protection)
    const rateLimit = checkInviteRateLimit(clientIp);
    if (!rateLimit.allowed) {
      console.log(`Invite validation rate limit exceeded for ${clientIp}`);
      const error = new RateLimitError(
        ErrorCodes.RATE_LIMITED_INVITE,
        `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfter / 60)} minutes.`,
        { retryAfter: rateLimit.retryAfter, reason: 'rate_limited' }
      );
      return res.status(error.statusCode).json({
        valid: false,
        ...error.toJSON()
      });
    }

    if (!token) {
      recordFailedInviteAttempt(clientIp);
      const error = new AuthError(
        ErrorCodes.INVITE_MISSING,
        'Invite token required',
        { reason: 'missing' }
      );
      return res.status(error.statusCode).json({
        valid: false,
        ...error.toJSON()
      });
    }

    const validation = await validateInvite(redis, token, clientIp);

    if (validation.valid) {
      res.status(200).json({ valid: true });
    } else {
      // Record failed attempt for rate limiting
      recordFailedInviteAttempt(clientIp);

      // Map validation reason to error code
      const codeMap = {
        invalid: ErrorCodes.INVITE_INVALID,
        not_found: ErrorCodes.INVITE_NOT_FOUND,
        expired: ErrorCodes.INVITE_EXPIRED,
        used: ErrorCodes.INVITE_USED,
        revoked: ErrorCodes.INVITE_REVOKED,
      };
      const errorCode = codeMap[validation.reason] || ErrorCodes.INVITE_INVALID;

      const error = new AuthError(
        errorCode,
        validation.message,
        { reason: validation.reason }
      );
      res.status(error.statusCode).json({
        valid: false,
        ...error.toJSON()
      });
    }
  });
}

module.exports = { register };
