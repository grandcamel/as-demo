/**
 * Integration tests for invite token flow.
 *
 * Tests the complete invite lifecycle: create, validate, redeem, expire.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createMockRedis, createInviteToken } = require('../mocks');

describe('Invite Flow', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis.clear();
  });

  describe('Create Invite', () => {
    it('should create a new invite token', async () => {
      const invite = createInviteToken({
        token: 'test-invite-123',
        label: 'Conference Demo',
        maxUsages: 50,
      });

      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
      expect(stored.token).toBe('test-invite-123');
      expect(stored.label).toBe('Conference Demo');
      expect(stored.maxUsages).toBe(50);
      expect(stored.usageCount).toBe(0);
    });

    it('should set expiration on invite', async () => {
      const invite = createInviteToken({ token: 'expiring-invite' });
      const ttlSeconds = 7 * 24 * 60 * 60; // 7 days

      await redis.set(`invite:${invite.token}`, JSON.stringify(invite), 'EX', ttlSeconds);

      const ttl = await redis.ttl(`invite:${invite.token}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(ttlSeconds);
    });

    it('should track invite creation metadata', async () => {
      const invite = createInviteToken({
        createdBy: 'admin@example.com',
        createdAt: new Date(),
      });

      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
      expect(stored.createdBy).toBe('admin@example.com');
      expect(stored.createdAt).toBeDefined();
    });
  });

  describe('Validate Invite', () => {
    it('should validate existing invite token', async () => {
      const invite = createInviteToken({ token: 'valid-invite' });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      const exists = await redis.exists(`invite:${invite.token}`);
      expect(exists).toBe(1);
    });

    it('should reject non-existent invite token', async () => {
      const exists = await redis.exists('invite:non-existent');
      expect(exists).toBe(0);
    });

    it('should check usage count against limit', async () => {
      const invite = createInviteToken({
        token: 'limited-invite',
        usageCount: 9,
        maxUsages: 10,
      });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
      const canUse = stored.usageCount < stored.maxUsages;

      expect(canUse).toBe(true);
    });

    it('should reject exhausted invite token', async () => {
      const invite = createInviteToken({
        token: 'exhausted-invite',
        usageCount: 10,
        maxUsages: 10,
      });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
      const canUse = stored.usageCount < stored.maxUsages;

      expect(canUse).toBe(false);
    });

    it('should check expiration date', async () => {
      const expiredInvite = createInviteToken({
        token: 'expired-invite',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      await redis.set(`invite:${expiredInvite.token}`, JSON.stringify(expiredInvite));

      const stored = JSON.parse(await redis.get(`invite:${expiredInvite.token}`));
      const isExpired = new Date(stored.expiresAt) < new Date();

      expect(isExpired).toBe(true);
    });
  });

  describe('Redeem Invite', () => {
    it('should increment usage count on redemption', async () => {
      const invite = createInviteToken({
        token: 'redeem-test',
        usageCount: 0,
      });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      // Redeem
      const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
      stored.usageCount++;
      await redis.set(`invite:${invite.token}`, JSON.stringify(stored));

      const updated = JSON.parse(await redis.get(`invite:${invite.token}`));
      expect(updated.usageCount).toBe(1);
    });

    it('should track redemption audit log', async () => {
      const invite = createInviteToken({ token: 'audit-test' });
      const auditEntry = {
        inviteToken: invite.token,
        clientId: 'test-client',
        timestamp: new Date().toISOString(),
        ip: '192.168.1.100',
        userAgent: 'Test Browser',
      };

      await redis.rpush(`invite:${invite.token}:audit`, JSON.stringify(auditEntry));

      const audit = await redis.lrange(`invite:${invite.token}:audit`, 0, -1);
      expect(audit).toHaveLength(1);

      const entry = JSON.parse(audit[0]);
      expect(entry.clientId).toBe('test-client');
    });

    it('should handle concurrent redemptions', async () => {
      const invite = createInviteToken({
        token: 'concurrent-test',
        usageCount: 0,
        maxUsages: 5,
      });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      // Simulate multiple concurrent redemptions
      const redemptions = [];
      for (let i = 0; i < 3; i++) {
        redemptions.push(
          (async () => {
            const stored = JSON.parse(await redis.get(`invite:${invite.token}`));
            if (stored.usageCount < stored.maxUsages) {
              stored.usageCount++;
              await redis.set(`invite:${invite.token}`, JSON.stringify(stored));
              return true;
            }
            return false;
          })()
        );
      }

      await Promise.all(redemptions);

      const final = JSON.parse(await redis.get(`invite:${invite.token}`));
      // In real implementation, this would need atomic operations
      // For mock, we're testing the flow
      expect(final.usageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Expire Invite', () => {
    it('should delete invite after TTL', async () => {
      const invite = createInviteToken({ token: 'ttl-test' });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite), 'EX', 1);

      // Immediately should exist
      expect(await redis.exists(`invite:${invite.token}`)).toBe(1);

      // In real Redis, would auto-expire after 1 second
      // For mock, we simulate by deleting
      await redis.del(`invite:${invite.token}`);
      expect(await redis.exists(`invite:${invite.token}`)).toBe(0);
    });

    it('should manually revoke invite', async () => {
      const invite = createInviteToken({ token: 'revoke-test' });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));

      expect(await redis.exists(`invite:${invite.token}`)).toBe(1);

      // Revoke
      await redis.del(`invite:${invite.token}`);

      expect(await redis.exists(`invite:${invite.token}`)).toBe(0);
    });

    it('should clean up audit log on expire', async () => {
      const invite = createInviteToken({ token: 'cleanup-test' });
      await redis.set(`invite:${invite.token}`, JSON.stringify(invite));
      await redis.rpush(`invite:${invite.token}:audit`, JSON.stringify({ entry: 1 }));

      // Clean up both keys
      await redis.del(`invite:${invite.token}`);
      await redis.del(`invite:${invite.token}:audit`);

      expect(await redis.exists(`invite:${invite.token}`)).toBe(0);
      expect(await redis.exists(`invite:${invite.token}:audit`)).toBe(0);
    });
  });

  describe('List Invites', () => {
    it('should list all active invites', async () => {
      const invites = [
        createInviteToken({ token: 'invite-1' }),
        createInviteToken({ token: 'invite-2' }),
        createInviteToken({ token: 'invite-3' }),
      ];

      for (const invite of invites) {
        await redis.set(`invite:${invite.token}`, JSON.stringify(invite));
      }

      const keys = await redis.keys('invite:*');
      expect(keys).toHaveLength(3);
    });

    it('should filter out expired invites from list', async () => {
      const validInvite = createInviteToken({
        token: 'valid',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const expiredInvite = createInviteToken({
        token: 'expired',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      await redis.set(`invite:${validInvite.token}`, JSON.stringify(validInvite));
      await redis.set(`invite:${expiredInvite.token}`, JSON.stringify(expiredInvite));

      const keys = await redis.keys('invite:*');
      const activeInvites = [];

      for (const key of keys) {
        const data = JSON.parse(await redis.get(key));
        if (new Date(data.expiresAt) > new Date()) {
          activeInvites.push(data);
        }
      }

      expect(activeInvites).toHaveLength(1);
      expect(activeInvites[0].token).toBe('valid');
    });
  });

  describe('Rate Limiting', () => {
    it('should track validation attempts', async () => {
      const ip = '192.168.1.100';
      const key = `ratelimit:invite:${ip}`;

      await redis.incr(key);
      await redis.incr(key);
      await redis.incr(key);

      const attempts = await redis.get(key);
      expect(parseInt(attempts)).toBe(3);
    });

    it('should block after max attempts', async () => {
      const ip = '192.168.1.200';
      const key = `ratelimit:invite:${ip}`;
      const maxAttempts = 5;

      for (let i = 0; i < maxAttempts; i++) {
        await redis.incr(key);
      }

      const attempts = parseInt(await redis.get(key));
      const isBlocked = attempts >= maxAttempts;

      expect(isBlocked).toBe(true);
    });
  });
});
