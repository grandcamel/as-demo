/**
 * Tests for services/queue.js
 *
 * Tests queue management: joining, leaving, position updates, and processing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('queue service', () => {
  let queue;
  let mockRedis;
  let mockWs;
  let mockState;
  let mockInviteService;
  let mockSessionService;

  // Shared state structures
  let clients;
  let queueArray;
  let pendingSessionTokens;
  let mockActiveSession;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh state for each test
    clients = new Map();
    queueArray = [];
    pendingSessionTokens = new Map();
    mockActiveSession = null;

    // Mock state
    mockState = {
      clients,
      queue: queueArray,
      pendingSessionTokens,
      getActiveSession: vi.fn(() => mockActiveSession),
      setActiveSession: vi.fn((session) => {
        mockActiveSession = session;
      }),
      tryAcquireReconnectionLock: vi.fn(() => true),
      setReconnectionInProgress: vi.fn(),
      clearDisconnectGraceTimeout: vi.fn(),
    };

    // Mock invite service
    mockInviteService = {
      validateInvite: vi.fn(() => ({ valid: true, data: { useCount: 0, maxUses: 1 } })),
    };

    // Mock session service
    mockSessionService = {
      generateSessionToken: vi.fn(() => 'mock-session-token-123'),
      startSession: vi.fn(),
      findClientWs: vi.fn(),
    };

    // Clear require cache
    const paths = [
      '../../services/queue',
      '../../services/state',
      '../../services/invite',
      '../../services/session',
      '../../config',
      '../../errors',
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

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        MAX_QUEUE_SIZE: 10,
        AVERAGE_SESSION_MINUTES: 45,
        ENABLED_PLATFORMS: ['confluence', 'jira'],
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

    // Mock invite service
    const invitePath = require.resolve('../../services/invite');
    require.cache[invitePath] = {
      id: invitePath,
      filename: invitePath,
      loaded: true,
      exports: mockInviteService,
    };

    // Mock session service
    const sessionPath = require.resolve('../../services/session');
    require.cache[sessionPath] = {
      id: sessionPath,
      filename: sessionPath,
      loaded: true,
      exports: mockSessionService,
    };

    // Mock errors module (required by queue.js)
    const errorsPath = require.resolve('../../errors');
    require.cache[errorsPath] = {
      id: errorsPath,
      filename: errorsPath,
      loaded: true,
      exports: {
        ErrorCodes: {
          ALREADY_IN_QUEUE: 'ERR_ALREADY_IN_QUEUE',
          QUEUE_FULL: 'ERR_QUEUE_FULL',
          RECONNECTION_IN_PROGRESS: 'ERR_RECONNECTION_IN_PROGRESS',
          INVITE_INVALID: 'ERR_INVITE_INVALID',
          INVITE_NOT_FOUND: 'ERR_INVITE_NOT_FOUND',
          INVITE_EXPIRED: 'ERR_INVITE_EXPIRED',
          INVITE_USED: 'ERR_INVITE_USED',
          INVITE_REVOKED: 'ERR_INVITE_REVOKED',
        },
        formatWsError: vi.fn((code, message) => JSON.stringify({ type: 'error', code, message })),
      },
    };

    // Now require the module
    queue = require('../../services/queue');

    // Setup mock WebSocket
    mockWs = {
      send: vi.fn(),
    };

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
  });

  describe('joinQueue', () => {
    describe('reconnection during grace period', () => {
      it('should handle reconnection to active session', async () => {
        mockActiveSession = {
          sessionId: 'session-123',
          sessionToken: 'existing-token',
          inviteToken: 'invite-abc',
          ip: '192.168.1.1',
          awaitingReconnect: true,
          expiresAt: new Date(Date.now() + 600000),
        };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);

        const client = {
          id: 'client-new',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        const processQueueFn = vi.fn();
        await queue.joinQueue(mockRedis, mockWs, client, 'invite-abc', processQueueFn);

        expect(mockState.tryAcquireReconnectionLock).toHaveBeenCalled();
        expect(mockState.clearDisconnectGraceTimeout).toHaveBeenCalled();
        expect(mockActiveSession.clientId).toBe('client-new');
        expect(mockActiveSession.awaitingReconnect).toBe(false);
        expect(client.state).toBe('active');
        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"session_token"'));
        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"reconnected":true'));
      });

      it('should reject when reconnection lock is already held', async () => {
        mockActiveSession = {
          sessionId: 'session-123',
          inviteToken: 'invite-abc',
          ip: '192.168.1.1',
          awaitingReconnect: true,
        };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);
        mockState.tryAcquireReconnectionLock.mockReturnValue(false);

        const client = {
          id: 'client-new',
          ip: '192.168.1.1',
        };

        await queue.joinQueue(mockRedis, mockWs, client, 'invite-abc', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('ERR_RECONNECTION_IN_PROGRESS')
        );
      });

      it('should not reconnect if IP does not match', async () => {
        mockActiveSession = {
          sessionId: 'session-123',
          inviteToken: 'invite-abc',
          ip: '10.0.0.1',
          awaitingReconnect: true,
        };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);

        const client = {
          id: 'client-new',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, 'invite-abc', vi.fn());

        // Should proceed with normal queue join
        expect(queueArray).toContain('client-new');
      });

      it('should not reconnect if not awaiting reconnect', async () => {
        mockActiveSession = {
          sessionId: 'session-123',
          inviteToken: 'invite-abc',
          ip: '192.168.1.1',
          awaitingReconnect: false,
        };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);

        const client = {
          id: 'client-new',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, 'invite-abc', vi.fn());

        // Should proceed with normal queue join
        expect(queueArray).toContain('client-new');
      });
    });

    describe('already in queue', () => {
      it('should reject if client is already in queue', async () => {
        queueArray.push('client-1');

        const client = { id: 'client-1' };

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_ALREADY_IN_QUEUE'));
        expect(queueArray).toHaveLength(1);
      });
    });

    describe('invite validation', () => {
      it('should validate invite token when provided', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, 'invite-token', vi.fn());

        expect(mockInviteService.validateInvite).toHaveBeenCalledWith(
          mockRedis,
          'invite-token',
          '192.168.1.1'
        );
        expect(client.inviteToken).toBe('invite-token');
      });

      it('should reject with invite_invalid for invalid token', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'invalid',
          message: 'Malformed token',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'bad-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"invite_invalid"')
        );
        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"reason":"invalid"'));
        expect(queueArray).toHaveLength(0);
      });

      it('should reject with invite_invalid for not_found', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'not_found',
          message: 'Invite not found',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'unknown-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_INVITE_NOT_FOUND'));
      });

      it('should reject with invite_invalid for expired', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'expired',
          message: 'Invite expired',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'expired-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_INVITE_EXPIRED'));
      });

      it('should reject with invite_invalid for used', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'used',
          message: 'Invite already used',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'used-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_INVITE_USED'));
      });

      it('should reject with invite_invalid for revoked', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'revoked',
          message: 'Invite revoked',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'revoked-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_INVITE_REVOKED'));
      });

      it('should fallback to INVITE_INVALID for unknown reason', async () => {
        mockInviteService.validateInvite.mockResolvedValue({
          valid: false,
          reason: 'unknown_reason',
          message: 'Unknown error',
        });

        const client = { id: 'client-1', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, 'bad-token', vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_INVITE_INVALID'));
      });

      it('should allow joining without invite token', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockInviteService.validateInvite).not.toHaveBeenCalled();
        expect(queueArray).toContain('client-1');
      });
    });

    describe('queue full', () => {
      it('should reject when queue is full', async () => {
        // Fill the queue (MAX_QUEUE_SIZE = 10)
        for (let i = 0; i < 10; i++) {
          queueArray.push(`client-${i}`);
        }

        const client = { id: 'client-new', ip: '192.168.1.1' };

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"queue_full"'));
        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_QUEUE_FULL'));
        expect(queueArray).toHaveLength(10);
      });
    });

    describe('successful join', () => {
      it('should generate and store pending session token', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockSessionService.generateSessionToken).toHaveBeenCalledWith('client-1');
        expect(client.pendingSessionToken).toBe('mock-session-token-123');
        expect(pendingSessionTokens.has('mock-session-token-123')).toBe(true);
        expect(pendingSessionTokens.get('mock-session-token-123').clientId).toBe('client-1');
      });

      it('should send session_token message immediately', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({ type: 'session_token', session_token: 'mock-session-token-123' })
        );
      });

      it('should add client to queue and update state', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(queueArray).toContain('client-1');
        expect(client.state).toBe('queued');
        expect(client.joinedAt).toBeInstanceOf(Date);
      });

      it('should start session immediately if no active session and first in queue', async () => {
        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        const processQueueFn = vi.fn();
        await queue.joinQueue(mockRedis, mockWs, client, null, processQueueFn);

        expect(mockSessionService.startSession).toHaveBeenCalledWith(
          mockRedis,
          mockWs,
          client,
          processQueueFn
        );
      });

      it('should send queue position if there is an active session', async () => {
        mockActiveSession = { sessionId: 'session-active' };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);

        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockSessionService.startSession).not.toHaveBeenCalled();
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"queue_position"')
        );
      });

      it('should send queue position if not first in queue', async () => {
        queueArray.push('client-0');

        const client = {
          id: 'client-1',
          ip: '192.168.1.1',
          state: 'connected',
        };
        clients.set(mockWs, client);

        await queue.joinQueue(mockRedis, mockWs, client, null, vi.fn());

        expect(mockSessionService.startSession).not.toHaveBeenCalled();
        expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"position":2'));
      });
    });
  });

  describe('leaveQueue', () => {
    it('should remove client from queue', () => {
      queueArray.push('client-1');
      const client = { id: 'client-1', state: 'queued' };
      clients.set(mockWs, client);

      queue.leaveQueue(mockWs, client);

      expect(queueArray).not.toContain('client-1');
      expect(client.state).toBe('connected');
    });

    it('should send left_queue message', () => {
      queueArray.push('client-1');
      const client = { id: 'client-1', state: 'queued' };
      clients.set(mockWs, client);

      queue.leaveQueue(mockWs, client);

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'left_queue' }));
    });

    it('should do nothing if client not in queue', () => {
      const client = { id: 'client-1', state: 'connected' };

      queue.leaveQueue(mockWs, client);

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('sendQueuePosition', () => {
    it('should send correct position when first in queue', () => {
      queueArray.push('client-1');
      const client = { id: 'client-1' };

      queue.sendQueuePosition(mockWs, client);

      const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('queue_position');
      expect(sent.position).toBe(1);
      expect(sent.queue_size).toBe(1);
      expect(sent.estimated_wait).toBe('45 minutes');
    });

    it('should send correct position when third in queue', () => {
      queueArray.push('client-0', 'client-1', 'client-2');
      const client = { id: 'client-2' };

      queue.sendQueuePosition(mockWs, client);

      const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sent.position).toBe(3);
      expect(sent.queue_size).toBe(3);
      expect(sent.estimated_wait).toBe('135 minutes');
    });

    it('should handle position 0 when not in queue', () => {
      const client = { id: 'client-not-in-queue' };

      queue.sendQueuePosition(mockWs, client);

      const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sent.position).toBe(0);
    });
  });

  describe('broadcastQueueUpdate', () => {
    it('should send position update to all queued clients', () => {
      const mockWs1 = { send: vi.fn() };
      const mockWs2 = { send: vi.fn() };
      const mockWs3 = { send: vi.fn() };

      clients.set(mockWs1, { id: 'client-1', state: 'queued' });
      clients.set(mockWs2, { id: 'client-2', state: 'queued' });
      clients.set(mockWs3, { id: 'client-3', state: 'connected' }); // Not queued

      queueArray.push('client-1', 'client-2');

      queue.broadcastQueueUpdate();

      expect(mockWs1.send).toHaveBeenCalledWith(expect.stringContaining('"type":"queue_position"'));
      expect(mockWs2.send).toHaveBeenCalledWith(expect.stringContaining('"type":"queue_position"'));
      expect(mockWs3.send).not.toHaveBeenCalled();
    });

    it('should send correct positions to each client', () => {
      const mockWs1 = { send: vi.fn() };
      const mockWs2 = { send: vi.fn() };

      clients.set(mockWs1, { id: 'client-1', state: 'queued' });
      clients.set(mockWs2, { id: 'client-2', state: 'queued' });

      queueArray.push('client-1', 'client-2');

      queue.broadcastQueueUpdate();

      const sent1 = JSON.parse(mockWs1.send.mock.calls[0][0]);
      const sent2 = JSON.parse(mockWs2.send.mock.calls[0][0]);

      expect(sent1.position).toBe(1);
      expect(sent2.position).toBe(2);
    });
  });

  describe('processQueue', () => {
    it('should do nothing if there is an active session', () => {
      mockActiveSession = { sessionId: 'session-123' };
      mockState.getActiveSession.mockReturnValue(mockActiveSession);
      queueArray.push('client-1');

      queue.processQueue(mockRedis);

      expect(mockSessionService.findClientWs).not.toHaveBeenCalled();
    });

    it('should do nothing if queue is empty', () => {
      queue.processQueue(mockRedis);

      expect(mockSessionService.findClientWs).not.toHaveBeenCalled();
    });

    it('should start session for next client in queue', () => {
      const clientWs = { send: vi.fn() };
      const client = { id: 'client-1', state: 'queued' };
      clients.set(clientWs, client);
      queueArray.push('client-1');

      mockSessionService.findClientWs.mockReturnValue(clientWs);

      queue.processQueue(mockRedis);

      expect(mockSessionService.findClientWs).toHaveBeenCalledWith('client-1');
      expect(mockSessionService.startSession).toHaveBeenCalledWith(
        mockRedis,
        clientWs,
        client,
        expect.any(Function)
      );
    });

    it('should remove disconnected client and try next', () => {
      const clientWs = { send: vi.fn() };
      const client = { id: 'client-2', state: 'queued' };
      clients.set(clientWs, client);
      queueArray.push('client-disconnected', 'client-2');

      // First call returns null (disconnected), second returns the ws
      mockSessionService.findClientWs.mockReturnValueOnce(null).mockReturnValueOnce(clientWs);

      queue.processQueue(mockRedis);

      expect(queueArray).not.toContain('client-disconnected');
      expect(mockSessionService.startSession).toHaveBeenCalledWith(
        mockRedis,
        clientWs,
        client,
        expect.any(Function)
      );
    });

    it('should recursively remove all disconnected clients', () => {
      queueArray.push('disconnected-1', 'disconnected-2', 'disconnected-3');
      mockSessionService.findClientWs.mockReturnValue(null);

      queue.processQueue(mockRedis);

      expect(queueArray).toHaveLength(0);
      expect(mockSessionService.startSession).not.toHaveBeenCalled();
    });
  });
});
