/**
 * Tests for services/invite.js
 *
 * Tests invite validation, rate limiting, and usage recording.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('invite service', () => {
  let invite;
  let mockRedis;
  let mockRateLimiter;
  let mockState;
  let mockTracer;
  let mockSpan;
  let mockInvitesValidatedCounter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock rate limiter
    mockRateLimiter = {
      check: vi.fn(() => ({ allowed: true, remaining: 9 })),
      recordFailure: vi.fn(),
      cleanup: vi.fn(),
    };

    // Create mock tracer and span
    mockSpan = {
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };
    mockTracer = {
      startSpan: vi.fn(() => mockSpan),
    };

    // Create mock counter
    mockInvitesValidatedCounter = {
      add: vi.fn(),
    };

    // Create mock state
    mockState = {
      getActiveSession: vi.fn(() => null),
      pendingSessionTokens: new Map(),
    };

    // Clear require cache for all modules we're testing
    const paths = [
      '../../services/invite',
      '../../services/state',
      '../../config',
      '../../config/metrics',
      '@demo-platform/queue-manager-core',
    ]
      .map((p) => {
        try {
          return require.resolve(p);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    paths.forEach((p) => delete require.cache[p]);

    // Mock @demo-platform/queue-manager-core
    const corePath = require.resolve('@demo-platform/queue-manager-core');
    require.cache[corePath] = {
      id: corePath,
      filename: corePath,
      loaded: true,
      exports: {
        createInviteRateLimiter: vi.fn(() => mockRateLimiter),
      },
    };

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        INVITE_RATE_LIMIT_WINDOW_MS: 3600000,
        INVITE_RATE_LIMIT_MAX_ATTEMPTS: 10,
        AUDIT_RETENTION_DAYS: 30,
      },
    };

    // Mock config/metrics
    const metricsPath = require.resolve('../../config/metrics');
    require.cache[metricsPath] = {
      id: metricsPath,
      filename: metricsPath,
      loaded: true,
      exports: {
        getTracer: vi.fn(() => mockTracer),
        invitesValidatedCounter: mockInvitesValidatedCounter,
      },
    };

    // Mock state
    const statePath = require.resolve('../../services/state');
    require.cache[statePath] = {
      id: statePath,
      filename: statePath,
      loaded: true,
      exports: mockState,
    };

    // Now require the module
    invite = require('../../services/invite');

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      ttl: vi.fn(),
    };
  });

  describe('checkInviteRateLimit', () => {
    it('should return allowed when not rate limited', () => {
      mockRateLimiter.check.mockReturnValue({ allowed: true, remaining: 9 });

      const result = invite.checkInviteRateLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(mockRateLimiter.check).toHaveBeenCalledWith('192.168.1.1', false);
    });

    it('should return blocked with retryAfter when rate limited', () => {
      mockRateLimiter.check.mockReturnValue({ allowed: false, remaining: 0, retryAfter: 3600 });

      const result = invite.checkInviteRateLimit('192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(3600);
    });

    it('should not increment counter on check', () => {
      invite.checkInviteRateLimit('192.168.1.1');

      expect(mockRateLimiter.check).toHaveBeenCalledWith('192.168.1.1', false);
    });
  });

  describe('recordFailedInviteAttempt', () => {
    it('should record failure on rate limiter', () => {
      invite.recordFailedInviteAttempt('192.168.1.1');

      expect(mockRateLimiter.recordFailure).toHaveBeenCalledWith('192.168.1.1');
    });
  });

  describe('validateInvite', () => {
    describe('token format validation', () => {
      it('should reject null token', async () => {
        const result = await invite.validateInvite(mockRedis, null, '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid');
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'invalid' });
      });

      it('should reject empty token', async () => {
        const result = await invite.validateInvite(mockRedis, '', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should reject token shorter than 4 characters', async () => {
        const result = await invite.validateInvite(mockRedis, 'abc', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should reject token longer than 64 characters', async () => {
        const longToken = 'a'.repeat(65);
        const result = await invite.validateInvite(mockRedis, longToken, '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should reject token with invalid characters', async () => {
        const result = await invite.validateInvite(mockRedis, 'test token!', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should accept valid token format with URL-safe characters', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, 'Valid_Token-123', '192.168.1.1');

        expect(result.valid).toBe(true);
        expect(mockRedis.get).toHaveBeenCalledWith('invite:Valid_Token-123');
      });

      it('should accept token with exactly 4 characters', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, 'abcd', '192.168.1.1');

        expect(result.valid).toBe(true);
      });

      it('should accept token with exactly 64 characters', async () => {
        const token64 = 'a'.repeat(64);
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, token64, '192.168.1.1');

        expect(result.valid).toBe(true);
      });
    });

    describe('Redis lookup', () => {
      it('should return not_found when invite does not exist', async () => {
        mockRedis.get.mockResolvedValue(null);

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_found');
        expect(result.message).toContain('does not exist');
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'not_found' });
      });

      it('should return revoked when invite is revoked', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'revoked',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('revoked');
        expect(result.message).toContain('revoked by an administrator');
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'revoked' });
      });

      it('should return used when invite status is used', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
        expect(result.message).toContain('already been used');
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'used' });
      });

      it('should return used when useCount >= maxUses', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 3,
            maxUses: 3,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
      });
    });

    describe('expiration handling', () => {
      it('should return expired when invite is past expiration date', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          })
        );
        mockRedis.ttl.mockResolvedValue(86400);

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
        expect(result.message).toContain('has expired');
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'expired' });
      });

      it('should update invite status to expired in Redis', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          })
        );
        mockRedis.ttl.mockResolvedValue(86400);

        await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(mockRedis.set).toHaveBeenCalledWith(
          'invite:valid-token',
          expect.stringContaining('"status":"expired"'),
          'EX',
          86400
        );
      });

      it('should use default TTL of 86400 when Redis TTL is negative', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          })
        );
        mockRedis.ttl.mockResolvedValue(-1);

        await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(mockRedis.set).toHaveBeenCalledWith(
          'invite:valid-token',
          expect.any(String),
          'EX',
          86400
        );
      });
    });

    describe('rejoin logic', () => {
      it('should allow rejoin for active session with same IP and invite', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue({
          inviteToken: 'valid-token',
          ip: '192.168.1.1',
          awaitingReconnect: false,
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(true);
        expect(result.rejoin).toBe(true);
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'rejoin' });
      });

      it('should not allow rejoin if IP does not match active session', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue({
          inviteToken: 'valid-token',
          ip: '10.0.0.1',
          awaitingReconnect: false,
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
      });

      it('should not allow rejoin if invite token does not match active session', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue({
          inviteToken: 'different-token',
          ip: '192.168.1.1',
          awaitingReconnect: false,
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
      });

      it('should allow rejoin for pending session with same IP and invite', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue(null);
        mockState.pendingSessionTokens.set('pending-token-123', {
          clientId: 'client-1',
          inviteToken: 'valid-token',
          ip: '192.168.1.1',
          createdAt: new Date(),
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(true);
        expect(result.rejoin).toBe(true);
      });

      it('should not allow rejoin for pending session with different IP', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue(null);
        mockState.pendingSessionTokens.set('pending-token-123', {
          clientId: 'client-1',
          inviteToken: 'valid-token',
          ip: '10.0.0.1',
          createdAt: new Date(),
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
      });

      it('should not allow rejoin when clientIp is null', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'used',
            useCount: 1,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );
        mockState.getActiveSession.mockReturnValue({
          inviteToken: 'valid-token',
          ip: '192.168.1.1',
        });

        const result = await invite.validateInvite(mockRedis, 'valid-token', null);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('used');
      });
    });

    describe('valid invite', () => {
      it('should return valid for active invite', async () => {
        const inviteData = {
          status: 'active',
          useCount: 0,
          maxUses: 1,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(inviteData));

        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(result.valid).toBe(true);
        expect(result.data).toEqual(inviteData);
        expect(result.rejoin).toBeUndefined();
        expect(mockInvitesValidatedCounter.add).toHaveBeenCalledWith(1, { status: 'valid' });
      });
    });

    describe('tracing', () => {
      it('should start and end span', async () => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');

        expect(mockTracer.startSpan).toHaveBeenCalledWith('invite.validate', {
          attributes: { 'invite.token_prefix': 'valid-to' },
        });
        expect(mockSpan.setAttribute).toHaveBeenCalledWith('invite.status', 'valid');
        expect(mockSpan.end).toHaveBeenCalled();
      });

      it('should handle null tracer gracefully', async () => {
        // Re-mock metrics with null tracer
        const metricsPath = require.resolve('../../config/metrics');
        delete require.cache[metricsPath];
        require.cache[metricsPath] = {
          id: metricsPath,
          filename: metricsPath,
          loaded: true,
          exports: {
            getTracer: vi.fn(() => null),
            invitesValidatedCounter: mockInvitesValidatedCounter,
          },
        };

        // Re-require invite module
        const invitePath = require.resolve('../../services/invite');
        delete require.cache[invitePath];
        invite = require('../../services/invite');

        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            status: 'active',
            useCount: 0,
            maxUses: 1,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        );

        // Should not throw
        const result = await invite.validateInvite(mockRedis, 'valid-token', '192.168.1.1');
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('recordInviteUsage', () => {
    it('should record session usage on invite', async () => {
      const existingInvite = {
        status: 'active',
        useCount: 0,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        sessions: [],
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(Date.now() - 300000),
        queueWaitMs: 5000,
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        errors: [],
      };
      const endedAt = new Date();

      await invite.recordInviteUsage(mockRedis, session, endedAt, 'timeout', 30);

      expect(mockRedis.get).toHaveBeenCalledWith('invite:valid-token');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'invite:valid-token',
        expect.any(String),
        'EX',
        expect.any(Number)
      );

      // Verify the saved data
      const savedData = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(savedData.sessions).toHaveLength(1);
      expect(savedData.sessions[0].sessionId).toBe('session-123');
      expect(savedData.sessions[0].endReason).toBe('timeout');
      expect(savedData.useCount).toBe(1);
    });

    it('should set status to used when useCount reaches maxUses', async () => {
      const existingInvite = {
        status: 'active',
        useCount: 0,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
        errors: [],
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      const savedData = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(savedData.status).toBe('used');
    });

    it('should not change status when more uses remaining', async () => {
      const existingInvite = {
        status: 'active',
        useCount: 0,
        maxUses: 3,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
        errors: [],
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      const savedData = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(savedData.status).toBe('active');
      expect(savedData.useCount).toBe(1);
    });

    it('should initialize sessions array if not present', async () => {
      const existingInvite = {
        status: 'active',
        useCount: 0,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        // No sessions array
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
        errors: [],
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      const savedData = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(savedData.sessions).toHaveLength(1);
    });

    it('should handle missing invite gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const session = {
        inviteToken: 'nonexistent-token',
        sessionId: 'session-123',
        clientId: 'client-456',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
      consoleSpy.mockRestore();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const session = {
        inviteToken: 'valid-token',
        sessionId: 'session-123',
        clientId: 'client-456',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error recording invite usage:',
        'Redis connection error'
      );
      consoleSpy.mockRestore();
    });

    it('should calculate TTL based on expiration and audit retention', async () => {
      const expiresAt = new Date(Date.now() + 86400000); // 1 day from now
      const existingInvite = {
        status: 'active',
        useCount: 0,
        maxUses: 1,
        expiresAt: expiresAt.toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
        errors: [],
      };

      // 30 days audit retention
      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 30);

      // TTL should be at least (1 day + 30 days) in seconds
      const ttlArg = mockRedis.set.mock.calls[0][3];
      expect(ttlArg).toBeGreaterThan(30 * 24 * 60 * 60); // > 30 days
    });

    it('should ensure minimum TTL of 1 day', async () => {
      const expiresAt = new Date(Date.now() - 86400000); // Already expired
      const existingInvite = {
        status: 'expired',
        useCount: 0,
        maxUses: 1,
        expiresAt: expiresAt.toISOString(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingInvite));

      const session = {
        sessionId: 'session-123',
        clientId: 'client-456',
        inviteToken: 'valid-token',
        startedAt: new Date(),
        queueWaitMs: 0,
        ip: '192.168.1.1',
        userAgent: 'Test',
        errors: [],
      };

      await invite.recordInviteUsage(mockRedis, session, new Date(), 'completed', 0);

      const ttlArg = mockRedis.set.mock.calls[0][3];
      expect(ttlArg).toBeGreaterThanOrEqual(86400); // At least 1 day
    });
  });

  describe('cleanupRateLimits', () => {
    it('should call cleanup on rate limiter', () => {
      invite.cleanupRateLimits();

      expect(mockRateLimiter.cleanup).toHaveBeenCalled();
    });
  });
});
