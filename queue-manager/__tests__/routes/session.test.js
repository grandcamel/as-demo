/**
 * Tests for routes/session.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('session routes', () => {
  let session;
  let mockApp;
  let mockRedis;
  let state;
  let config;
  let invite;
  let registeredRoutes;

  // Shared mock state
  let sessionTokens;
  let pendingSessionTokens;
  let mockGetActiveSession;
  let mockCheckInviteRateLimit;
  let mockRecordFailedInviteAttempt;
  let mockValidateInvite;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh Maps for each test
    sessionTokens = new Map();
    pendingSessionTokens = new Map();

    mockGetActiveSession = vi.fn(() => null);
    mockCheckInviteRateLimit = vi.fn(() => ({ allowed: true, remaining: 9 }));
    mockRecordFailedInviteAttempt = vi.fn();
    mockValidateInvite = vi.fn();

    // Clear require cache
    const paths = [
      '../../routes/session',
      '../../services/state',
      '../../services/invite',
      '../../config'
    ].map(p => {
      try { return require.resolve(p); } catch { return null; }
    }).filter(Boolean);

    paths.forEach(p => delete require.cache[p]);

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        SESSION_TIMEOUT_MINUTES: 60,
        COOKIE_SECURE: false
      }
    };

    // Mock state
    const statePath = require.resolve('../../services/state');
    require.cache[statePath] = {
      id: statePath,
      filename: statePath,
      loaded: true,
      exports: {
        sessionTokens,
        pendingSessionTokens,
        getActiveSession: mockGetActiveSession
      }
    };

    // Mock invite service
    const invitePath = require.resolve('../../services/invite');
    require.cache[invitePath] = {
      id: invitePath,
      filename: invitePath,
      loaded: true,
      exports: {
        checkInviteRateLimit: mockCheckInviteRateLimit,
        recordFailedInviteAttempt: mockRecordFailedInviteAttempt,
        validateInvite: mockValidateInvite
      }
    };

    // Import modules
    state = require('../../services/state');
    config = require('../../config');
    invite = require('../../services/invite');
    session = require('../../routes/session');

    registeredRoutes = {};
    mockApp = {
      get: vi.fn((path, handler) => {
        registeredRoutes[`GET ${path}`] = handler;
      }),
      post: vi.fn((path, handler) => {
        registeredRoutes[`POST ${path}`] = handler;
      })
    };

    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn()
    };

    session.register(mockApp, mockRedis);
  });

  describe('register', () => {
    it('should register /api/session/validate route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/session/validate', expect.any(Function));
    });

    it('should register /api/session/cookie route', () => {
      expect(mockApp.post).toHaveBeenCalledWith('/api/session/cookie', expect.any(Function));
    });

    it('should register /api/session/logout route', () => {
      expect(mockApp.post).toHaveBeenCalledWith('/api/session/logout', expect.any(Function));
    });

    it('should register /api/invite/validate route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/invite/validate', expect.any(Function));
    });
  });

  describe('GET /api/session/validate', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['GET /api/session/validate'];
      mockReq = {
        cookies: {}
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        set: vi.fn()
      };
    });

    it('should return 401 when no session cookie', () => {
      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith('No session cookie');
    });

    it('should return 200 for valid active session token', () => {
      mockReq.cookies.demo_session = 'valid-token';
      state.sessionTokens.set('valid-token', 'session-123');
      state.getActiveSession.mockReturnValue({ sessionId: 'session-123' });

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      expect(mockRes.set).toHaveBeenCalledWith('X-Grafana-User', 'demo-session-');
    });

    it('should return 200 for valid pending session token', () => {
      mockReq.cookies.demo_session = 'pending-token';
      state.pendingSessionTokens.set('pending-token', { clientId: 'client-123' });

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      expect(mockRes.set).toHaveBeenCalledWith('X-Grafana-User', 'demo-client-1');
    });

    it('should return 401 for invalid token', () => {
      mockReq.cookies.demo_session = 'invalid-token';

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith('Session not active');
    });

    it('should clean up stale session token', () => {
      mockReq.cookies.demo_session = 'stale-token';
      state.sessionTokens.set('stale-token', 'old-session');
      // But no active session matches

      handler(mockReq, mockRes);

      expect(state.sessionTokens.has('stale-token')).toBe(false);
    });
  });

  describe('POST /api/session/cookie', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['POST /api/session/cookie'];
      mockReq = {
        body: {}
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        cookie: vi.fn()
      };
    });

    it('should return 400 when token missing', () => {
      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token required' });
    });

    it('should return 400 when token is not string', () => {
      mockReq.body.token = 12345;

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token required' });
    });

    it('should return 401 for invalid token', () => {
      mockReq.body.token = 'invalid-token';

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should set cookie for valid active token', () => {
      mockReq.body.token = 'valid-token';
      state.sessionTokens.set('valid-token', 'session-123');

      handler(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith('demo_session', 'valid-token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000, // 60 minutes
        path: '/'
      });
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('should set cookie for valid pending token', () => {
      mockReq.body.token = 'pending-token';
      state.pendingSessionTokens.set('pending-token', { clientId: 'client-1' });

      handler(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith('demo_session', 'pending-token', expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /api/session/logout', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['POST /api/session/logout'];
      mockReq = {};
      mockRes = {
        json: vi.fn(),
        clearCookie: vi.fn()
      };
    });

    it('should clear session cookie', () => {
      handler(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('demo_session', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/'
      });
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('GET /api/invite/validate', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['GET /api/invite/validate'];
      mockReq = {
        headers: {},
        query: {},
        socket: { remoteAddress: '127.0.0.1' }
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
    });

    it('should return 429 when rate limited', async () => {
      invite.checkInviteRateLimit.mockReturnValue({ allowed: false, retryAfter: 3600 });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        valid: false,
        reason: 'rate_limited',
        message: expect.stringContaining('Too many attempts')
      });
    });

    it('should return 401 when token missing', async () => {
      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        valid: false,
        reason: 'missing',
        message: 'Invite token required'
      });
      expect(invite.recordFailedInviteAttempt).toHaveBeenCalled();
    });

    it('should accept token from header', async () => {
      mockReq.headers['x-invite-token'] = 'valid-token';
      invite.validateInvite.mockResolvedValue({ valid: true });

      await handler(mockReq, mockRes);

      expect(invite.validateInvite).toHaveBeenCalledWith(mockRedis, 'valid-token', '127.0.0.1');
    });

    it('should accept token from query param', async () => {
      mockReq.query.token = 'query-token';
      invite.validateInvite.mockResolvedValue({ valid: true });

      await handler(mockReq, mockRes);

      expect(invite.validateInvite).toHaveBeenCalledWith(mockRedis, 'query-token', '127.0.0.1');
    });

    it('should prefer header token over query param', async () => {
      mockReq.headers['x-invite-token'] = 'header-token';
      mockReq.query.token = 'query-token';
      invite.validateInvite.mockResolvedValue({ valid: true });

      await handler(mockReq, mockRes);

      expect(invite.validateInvite).toHaveBeenCalledWith(mockRedis, 'header-token', '127.0.0.1');
    });

    it('should return 200 for valid invite', async () => {
      mockReq.headers['x-invite-token'] = 'valid-token';
      invite.validateInvite.mockResolvedValue({ valid: true });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ valid: true });
    });

    it('should return 401 for invalid invite', async () => {
      mockReq.headers['x-invite-token'] = 'invalid-token';
      invite.validateInvite.mockResolvedValue({
        valid: false,
        reason: 'expired',
        message: 'Invite has expired'
      });

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        valid: false,
        reason: 'expired',
        message: 'Invite has expired'
      });
      expect(invite.recordFailedInviteAttempt).toHaveBeenCalled();
    });

    it('should use x-forwarded-for for IP', async () => {
      mockReq.headers['x-forwarded-for'] = '10.0.0.1, 192.168.1.1';
      mockReq.headers['x-invite-token'] = 'token';
      invite.validateInvite.mockResolvedValue({ valid: true });

      await handler(mockReq, mockRes);

      expect(invite.checkInviteRateLimit).toHaveBeenCalledWith('10.0.0.1');
    });
  });
});
