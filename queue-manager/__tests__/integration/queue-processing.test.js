/**
 * Integration tests for queue processing.
 *
 * Tests multi-client queue scenarios and session handoff.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createMockRedis, createClient } = require('../mocks');

describe('Queue Processing', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis.clear();
  });

  describe('Queue Order', () => {
    it('should process clients in FIFO order', async () => {
      const clients = ['first', 'second', 'third'];

      // Add clients to queue
      for (const id of clients) {
        await redis.rpush('queue', id);
      }

      // Verify order
      const queue = await redis.lrange('queue', 0, -1);
      expect(queue).toEqual(clients);
    });

    it('should maintain queue state across operations', async () => {
      // Add clients
      await redis.rpush('queue', 'client-1');
      await redis.rpush('queue', 'client-2');

      // Simulate processing first client
      const queue = await redis.lrange('queue', 0, -1);
      expect(queue[0]).toBe('client-1');

      // Remove first client (simulating session start)
      const newQueue = queue.slice(1);
      await redis.del('queue');
      for (const id of newQueue) {
        await redis.rpush('queue', id);
      }

      const updated = await redis.lrange('queue', 0, -1);
      expect(updated).toEqual(['client-2']);
    });
  });

  describe('Multi-Client Scenarios', () => {
    it('should handle multiple clients waiting', async () => {
      const clientCount = 5;
      const clients = [];

      for (let i = 0; i < clientCount; i++) {
        const client = createClient({ id: `client-${i}` });
        clients.push(client);
        await redis.set(`client:${client.id}`, JSON.stringify(client));
        await redis.rpush('queue', client.id);
      }

      const queue = await redis.lrange('queue', 0, -1);
      expect(queue).toHaveLength(clientCount);

      // Verify each client can be retrieved
      for (const id of queue) {
        const data = await redis.get(`client:${id}`);
        expect(data).not.toBeNull();
      }
    });

    it('should handle concurrent queue updates', async () => {
      // Simulate concurrent additions
      const additions = Promise.all([
        redis.rpush('queue', 'concurrent-1'),
        redis.rpush('queue', 'concurrent-2'),
        redis.rpush('queue', 'concurrent-3'),
      ]);

      await additions;

      const queue = await redis.lrange('queue', 0, -1);
      expect(queue).toHaveLength(3);
    });
  });

  describe('Queue Position Calculations', () => {
    it('should calculate correct queue positions', async () => {
      const clients = ['first', 'second', 'third', 'fourth'];

      for (const id of clients) {
        await redis.rpush('queue', id);
      }

      const queue = await redis.lrange('queue', 0, -1);

      // Position calculation
      clients.forEach((id, index) => {
        const position = queue.indexOf(id);
        expect(position).toBe(index);
      });
    });

    it('should update positions after session starts', async () => {
      await redis.rpush('queue', 'will-start');
      await redis.rpush('queue', 'waiting-1');
      await redis.rpush('queue', 'waiting-2');

      let queue = await redis.lrange('queue', 0, -1);
      expect(queue.indexOf('waiting-1')).toBe(1);

      // Simulate first client starting session
      await redis.del('queue');
      await redis.rpush('queue', 'waiting-1');
      await redis.rpush('queue', 'waiting-2');

      queue = await redis.lrange('queue', 0, -1);
      expect(queue.indexOf('waiting-1')).toBe(0);
      expect(queue.indexOf('waiting-2')).toBe(1);
    });
  });

  describe('Session Handoff', () => {
    it('should transfer session to next in queue', async () => {
      const currentSession = 'current';
      const nextClient = 'next';

      await redis.set(`session:${currentSession}`, JSON.stringify({ active: true }));
      await redis.rpush('queue', nextClient);

      // End current session
      await redis.del(`session:${currentSession}`);

      // Start next session
      const queue = await redis.lrange('queue', 0, -1);
      const nextId = queue[0];

      await redis.set(
        `session:${nextId}`,
        JSON.stringify({
          active: true,
          startedAt: new Date().toISOString(),
        })
      );

      expect(await redis.exists(`session:${currentSession}`)).toBe(0);
      expect(await redis.exists(`session:${nextId}`)).toBe(1);
    });

    it('should handle empty queue gracefully', async () => {
      const queue = await redis.lrange('queue', 0, -1);
      expect(queue).toHaveLength(0);

      // No errors when processing empty queue
      expect(queue[0]).toBeUndefined();
    });
  });

  describe('Queue Limits', () => {
    it('should track queue size', async () => {
      const maxSize = 10;

      for (let i = 0; i < maxSize; i++) {
        await redis.rpush('queue', `client-${i}`);
      }

      const queue = await redis.lrange('queue', 0, -1);
      expect(queue).toHaveLength(maxSize);
    });

    it('should allow checking queue size before adding', async () => {
      const maxSize = 5;

      for (let i = 0; i < maxSize; i++) {
        await redis.rpush('queue', `client-${i}`);
      }

      const queue = await redis.lrange('queue', 0, -1);
      const canAdd = queue.length < maxSize;

      expect(canAdd).toBe(false);
    });
  });

  describe('Client Removal', () => {
    it('should remove client from queue on disconnect', async () => {
      const clientToRemove = 'will-disconnect';

      await redis.rpush('queue', 'stays-1');
      await redis.rpush('queue', clientToRemove);
      await redis.rpush('queue', 'stays-2');

      // Get current queue and remove client
      let queue = await redis.lrange('queue', 0, -1);
      const index = queue.indexOf(clientToRemove);

      if (index !== -1) {
        queue.splice(index, 1);
      }

      // Rebuild queue in Redis
      await redis.del('queue');
      for (const id of queue) {
        await redis.rpush('queue', id);
      }

      const updated = await redis.lrange('queue', 0, -1);
      expect(updated).not.toContain(clientToRemove);
      expect(updated).toHaveLength(2);
    });
  });
});
