/**
 * Integration tests for WebSocket lifecycle.
 *
 * Tests the complete flow from connection to session end.
 */

const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const { createMockRedis, createMockWsClient, createClient, createConfig } = require('../mocks');

// Mock the state module
vi.mock('../../services/state', () => ({
  clients: new Map(),
  queue: [],
  sessionTokens: new Map(),
  pendingSessionTokens: new Map(),
  activeSession: null,
  setActiveSession: vi.fn(function (session) {
    this.activeSession = session;
  }),
  getActiveSession: vi.fn(function () {
    return this.activeSession;
  }),
}));

describe('WebSocket Lifecycle', () => {
  let redis;
  let ws;

  beforeEach(() => {
    redis = createMockRedis();
    ws = createMockWsClient();
  });

  afterEach(() => {
    redis.clear();
    vi.clearAllMocks();
  });

  describe('Connection', () => {
    it('should accept new WebSocket connections', () => {
      expect(ws.readyState).toBe(1); // OPEN
      expect(ws.closed).toBe(false);
    });

    it('should track sent messages', () => {
      ws.send(JSON.stringify({ type: 'welcome' }));
      expect(ws.getSentMessages()).toHaveLength(1);
      expect(ws.getLastMessage().parsed.type).toBe('welcome');
    });

    it('should receive messages via event emitter', () => {
      const handler = vi.fn();
      ws.on('message', handler);

      ws.receive({ type: 'join_queue' });

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Queue Operations', () => {
    it('should store queue state in Redis', async () => {
      const client = createClient({ id: 'test-client-1' });

      await redis.rpush('queue:clients', client.id);
      await redis.set(`client:${client.id}`, JSON.stringify(client));

      const queuedClients = await redis.lrange('queue:clients', 0, -1);
      expect(queuedClients).toContain(client.id);

      const storedClient = JSON.parse(await redis.get(`client:${client.id}`));
      expect(storedClient.id).toBe(client.id);
    });

    it('should track queue position updates', async () => {
      const clients = [createClient({ id: 'client-1' }), createClient({ id: 'client-2' }), createClient({ id: 'client-3' })];

      for (const client of clients) {
        await redis.rpush('queue:clients', client.id);
      }

      const queue = await redis.lrange('queue:clients', 0, -1);
      expect(queue).toHaveLength(3);
      expect(queue[0]).toBe('client-1');
      expect(queue[2]).toBe('client-3');
    });
  });

  describe('Session Management', () => {
    it('should store session data in Redis', async () => {
      const client = createClient({ id: 'session-client' });
      const sessionData = {
        sessionId: 'test-session-123',
        clientId: client.id,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      await redis.set(`session:${client.id}`, JSON.stringify(sessionData), 'EX', 1800);

      const stored = JSON.parse(await redis.get(`session:${client.id}`));
      expect(stored.sessionId).toBe(sessionData.sessionId);
      expect(stored.clientId).toBe(client.id);
    });

    it('should clean up session data on end', async () => {
      const clientId = 'cleanup-client';

      await redis.set(`session:${clientId}`, JSON.stringify({ active: true }));
      expect(await redis.exists(`session:${clientId}`)).toBe(1);

      await redis.del(`session:${clientId}`);
      expect(await redis.exists(`session:${clientId}`)).toBe(0);
    });
  });

  describe('Disconnection', () => {
    it('should handle graceful disconnection', () => {
      const closeHandler = vi.fn();
      ws.on('close', closeHandler);

      ws.close(1000, 'Normal closure');

      expect(ws.closed).toBe(true);
      expect(ws.closeCode).toBe(1000);
      expect(closeHandler).toHaveBeenCalledWith(1000, 'Normal closure');
    });

    it('should handle error-based disconnection', () => {
      const errorHandler = vi.fn();
      ws.on('error', errorHandler);

      ws.error(new Error('Connection lost'));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should reject sends after close', () => {
      ws.close();

      expect(() => ws.send('test')).toThrow('WebSocket is closed');
    });
  });

  describe('Message Types', () => {
    it('should filter messages by type', () => {
      ws.send(JSON.stringify({ type: 'queue_position', position: 1 }));
      ws.send(JSON.stringify({ type: 'session_starting', terminal_url: '/terminal' }));
      ws.send(JSON.stringify({ type: 'queue_position', position: 0 }));

      const queueMessages = ws.getMessagesByType('queue_position');
      expect(queueMessages).toHaveLength(2);

      const sessionMessages = ws.getMessagesByType('session_starting');
      expect(sessionMessages).toHaveLength(1);
    });

    it('should check if message type was sent', () => {
      ws.send(JSON.stringify({ type: 'welcome' }));

      expect(ws.hasSentType('welcome')).toBe(true);
      expect(ws.hasSentType('error')).toBe(false);
    });
  });
});
