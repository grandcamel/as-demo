/**
 * Tests for handlers/websocket.js
 *
 * Tests WebSocket connection handling with mocked dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('websocket handler', () => {
  let websocket;
  let mockWss;
  let mockWs;
  let mockRedis;
  let state;
  let config;
  let queue;
  let rateLimiterMock;

  // Create shared mock state that persists across module reloads
  let clients;
  let queueArray;
  let pendingSessionTokens;

  // Mock functions for state module
  let mockGetActiveSession;
  let mockSetActiveSession;
  let mockClearDisconnectGraceTimeout;
  let mockSetDisconnectGraceTimeout;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh state for each test
    clients = new Map();
    queueArray = [];
    pendingSessionTokens = new Map();

    mockGetActiveSession = vi.fn(() => null);
    mockSetActiveSession = vi.fn();
    mockClearDisconnectGraceTimeout = vi.fn();
    mockSetDisconnectGraceTimeout = vi.fn();

    rateLimiterMock = {
      check: vi.fn(() => ({ allowed: true, remaining: 9 })),
      cleanup: vi.fn()
    };

    // Clear require cache for all modules we're testing
    const paths = [
      '../../handlers/websocket',
      '../../services/state',
      '../../services/queue',
      '../../services/session',
      '../../config',
      'uuid',
      '@demo-platform/queue-manager-core'
    ].map(p => {
      try { return require.resolve(p); } catch { return null; }
    }).filter(Boolean);

    paths.forEach(p => delete require.cache[p]);

    // Mock uuid
    const uuidPath = require.resolve('uuid');
    require.cache[uuidPath] = {
      id: uuidPath,
      filename: uuidPath,
      loaded: true,
      exports: { v4: vi.fn(() => 'mock-client-id') }
    };

    // Mock @demo-platform/queue-manager-core
    const corePath = require.resolve('@demo-platform/queue-manager-core');
    require.cache[corePath] = {
      id: corePath,
      filename: corePath,
      loaded: true,
      exports: { createConnectionRateLimiter: vi.fn(() => rateLimiterMock) }
    };

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_CONNECTIONS: 10,
        ALLOWED_ORIGINS: ['http://localhost:8080'],
        ENABLED_PLATFORMS: ['confluence', 'jira'],
        DISCONNECT_GRACE_MS: 10000,
        getConfiguredPlatforms: vi.fn(() => ['confluence'])
      }
    };

    // Mock state
    const statePath = require.resolve('../../services/state');
    require.cache[statePath] = {
      id: statePath,
      filename: statePath,
      loaded: true,
      exports: {
        clients,
        queue: queueArray,
        getActiveSession: mockGetActiveSession,
        setActiveSession: mockSetActiveSession,
        clearDisconnectGraceTimeout: mockClearDisconnectGraceTimeout,
        setDisconnectGraceTimeout: mockSetDisconnectGraceTimeout,
        pendingSessionTokens
      }
    };

    // Mock queue service
    const queuePath = require.resolve('../../services/queue');
    require.cache[queuePath] = {
      id: queuePath,
      filename: queuePath,
      loaded: true,
      exports: {
        joinQueue: vi.fn(),
        leaveQueue: vi.fn(),
        broadcastQueueUpdate: vi.fn(),
        processQueue: vi.fn()
      }
    };

    // Mock session service
    const sessionPath = require.resolve('../../services/session');
    require.cache[sessionPath] = {
      id: sessionPath,
      filename: sessionPath,
      loaded: true,
      exports: { endSession: vi.fn() }
    };

    // Now require the modules
    state = require('../../services/state');
    config = require('../../config');
    queue = require('../../services/queue');
    websocket = require('../../handlers/websocket');

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn()
    };

    mockWss = {
      on: vi.fn()
    };

    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn()
    };
  });

  describe('setup', () => {
    it('should register connection handler on wss', () => {
      websocket.setup(mockWss, mockRedis);

      expect(mockWss.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('connection handling', () => {
    let connectionHandler;

    beforeEach(() => {
      websocket.setup(mockWss, mockRedis);
      connectionHandler = mockWss.on.mock.calls[0][1];
    });

    it('should accept valid connection with allowed origin', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:8080',
          'user-agent': 'Test Browser'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).not.toHaveBeenCalled();
      expect(state.clients.has(mockWs)).toBe(true);
    });

    it('should store client with correct data', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:8080',
          'user-agent': 'Test Browser'
        },
        socket: { remoteAddress: '192.168.1.1' }
      };

      connectionHandler(mockWs, mockReq);

      const client = state.clients.get(mockWs);
      expect(client.id).toBe('mock-client-id');
      expect(client.state).toBe('connected');
      expect(client.ip).toBe('192.168.1.1');
      expect(client.userAgent).toBe('Test Browser');
      expect(client.inviteToken).toBeNull();
    });

    it('should use x-forwarded-for header for IP when present', () => {
      const mockReq = {
        headers: {
          origin: 'http://localhost:8080',
          'x-forwarded-for': '10.0.0.1, 192.168.1.1',
          'user-agent': 'Test'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      const client = state.clients.get(mockWs);
      expect(client.ip).toBe('10.0.0.1');
    });

    it('should send initial status on connection', () => {
      const mockReq = {
        headers: { origin: 'http://localhost:8080' },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"status"'));
    });

    it('should reject connection when rate limited', () => {
      rateLimiterMock.check.mockReturnValue({ allowed: false, remaining: 0, retryAfter: 60 });

      websocket.setup(mockWss, mockRedis);
      const handler = mockWss.on.mock.calls[0][1];

      const mockReq = {
        headers: { origin: 'http://localhost:8080' },
        socket: { remoteAddress: '127.0.0.1' }
      };

      handler(mockWs, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, expect.stringContaining('Rate limit exceeded'));
    });

    it('should reject connection with invalid origin', () => {
      const mockReq = {
        headers: {
          origin: 'http://evil.com',
          'user-agent': 'Test'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Origin not allowed');
    });

    it('should reject connection without origin in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockReq = {
        headers: { 'user-agent': 'Test' },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Origin header required');

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow connection without origin in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const mockReq = {
        headers: { 'user-agent': 'Test' },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).not.toHaveBeenCalled();
      expect(state.clients.has(mockWs)).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should register message, close, and error handlers', () => {
      const mockReq = {
        headers: { origin: 'http://localhost:8080' },
        socket: { remoteAddress: '127.0.0.1' }
      };

      connectionHandler(mockWs, mockReq);

      const onCalls = mockWs.on.mock.calls.map(c => c[0]);
      expect(onCalls).toContain('message');
      expect(onCalls).toContain('close');
      expect(onCalls).toContain('error');
    });
  });

  describe('message handling', () => {
    let connectionHandler;
    let messageHandler;

    beforeEach(() => {
      websocket.setup(mockWss, mockRedis);
      connectionHandler = mockWss.on.mock.calls[0][1];

      const mockReq = {
        headers: { origin: 'http://localhost:8080' },
        socket: { remoteAddress: '127.0.0.1' }
      };
      connectionHandler(mockWs, mockReq);

      // Get message handler
      const messageCall = mockWs.on.mock.calls.find(c => c[0] === 'message');
      messageHandler = messageCall[1];
    });

    it('should handle join_queue message', async () => {
      await messageHandler(JSON.stringify({ type: 'join_queue', inviteToken: 'abc123' }));

      expect(queue.joinQueue).toHaveBeenCalledWith(
        mockRedis,
        mockWs,
        expect.objectContaining({ id: 'mock-client-id' }),
        'abc123',
        expect.any(Function)
      );
    });

    it('should handle leave_queue message', async () => {
      await messageHandler(JSON.stringify({ type: 'leave_queue' }));

      expect(queue.leaveQueue).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({ id: 'mock-client-id' })
      );
    });

    it('should handle heartbeat message', async () => {
      await messageHandler(JSON.stringify({ type: 'heartbeat' }));

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'heartbeat_ack' }));
    });

    it('should send error for unknown message type', async () => {
      await messageHandler(JSON.stringify({ type: 'unknown_type' }));

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type')
      );
    });

    it('should send error for invalid JSON', async () => {
      await messageHandler('not valid json');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });
  });

  describe('disconnect handling', () => {
    let connectionHandler;
    let closeHandler;

    beforeEach(() => {
      websocket.setup(mockWss, mockRedis);
      connectionHandler = mockWss.on.mock.calls[0][1];

      const mockReq = {
        headers: { origin: 'http://localhost:8080' },
        socket: { remoteAddress: '127.0.0.1' }
      };
      connectionHandler(mockWs, mockReq);

      const closeCall = mockWs.on.mock.calls.find(c => c[0] === 'close');
      closeHandler = closeCall[1];
    });

    it('should remove client from clients map on disconnect', () => {
      expect(state.clients.has(mockWs)).toBe(true);

      closeHandler();

      expect(state.clients.has(mockWs)).toBe(false);
    });

    it('should remove client from queue if in queue', () => {
      state.queue.push('mock-client-id');

      closeHandler();

      expect(state.queue).not.toContain('mock-client-id');
      expect(queue.broadcastQueueUpdate).toHaveBeenCalled();
    });

    it('should start grace period if client has active session', () => {
      vi.useFakeTimers();

      state.getActiveSession.mockReturnValue({
        clientId: 'mock-client-id',
        sessionId: 'session-123'
      });

      closeHandler();

      expect(state.clearDisconnectGraceTimeout).toHaveBeenCalled();
      expect(state.setDisconnectGraceTimeout).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should clean up pending session token if not in active session', () => {
      const client = state.clients.get(mockWs);
      client.pendingSessionToken = 'pending-token-123';
      state.pendingSessionTokens.set('pending-token-123', { clientId: 'mock-client-id' });

      closeHandler();

      expect(state.pendingSessionTokens.has('pending-token-123')).toBe(false);
    });
  });

  describe('cleanupRateLimits', () => {
    it('should call cleanup on rate limiter', () => {
      websocket.cleanupRateLimits();

      expect(rateLimiterMock.cleanup).toHaveBeenCalled();
    });
  });
});
