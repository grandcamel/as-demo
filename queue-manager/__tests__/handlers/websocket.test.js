/**
 * Tests for handlers/websocket.js
 *
 * Tests WebSocket connection handling with mocked dependencies.
 */

describe('websocket handler', () => {
  let websocket;
  let mockWss;
  let mockWs;
  let mockRedis;
  let state;
  let config;
  let queue;
  let rateLimiterMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Create fresh state for each test
    const clients = new Map();
    const queueArray = [];
    const pendingSessionTokens = new Map();

    rateLimiterMock = {
      check: jest.fn(() => ({ allowed: true, remaining: 9 })),
      cleanup: jest.fn()
    };

    jest.doMock('uuid', () => ({
      v4: jest.fn(() => 'mock-client-id')
    }));

    jest.doMock('@demo-platform/queue-manager-core', () => ({
      createConnectionRateLimiter: jest.fn(() => rateLimiterMock)
    }));

    jest.doMock('../../config', () => ({
      RATE_LIMIT_WINDOW_MS: 60000,
      RATE_LIMIT_MAX_CONNECTIONS: 10,
      ALLOWED_ORIGINS: ['http://localhost:8080'],
      ENABLED_PLATFORMS: ['confluence', 'jira'],
      DISCONNECT_GRACE_MS: 10000,
      getConfiguredPlatforms: jest.fn(() => ['confluence'])
    }));

    jest.doMock('../../services/state', () => ({
      clients,
      queue: queueArray,
      getActiveSession: jest.fn(() => null),
      setActiveSession: jest.fn(),
      clearDisconnectGraceTimeout: jest.fn(),
      setDisconnectGraceTimeout: jest.fn(),
      pendingSessionTokens
    }));

    jest.doMock('../../services/queue', () => ({
      joinQueue: jest.fn(),
      leaveQueue: jest.fn(),
      broadcastQueueUpdate: jest.fn(),
      processQueue: jest.fn()
    }));

    jest.doMock('../../services/session', () => ({
      endSession: jest.fn()
    }));

    state = require('../../services/state');
    config = require('../../config');
    queue = require('../../services/queue');
    websocket = require('../../handlers/websocket');

    mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn()
    };

    mockWss = {
      on: jest.fn()
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
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
      jest.useFakeTimers();

      state.getActiveSession.mockReturnValue({
        clientId: 'mock-client-id',
        sessionId: 'session-123'
      });

      closeHandler();

      expect(state.clearDisconnectGraceTimeout).toHaveBeenCalled();
      expect(state.setDisconnectGraceTimeout).toHaveBeenCalled();

      jest.useRealTimers();
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
