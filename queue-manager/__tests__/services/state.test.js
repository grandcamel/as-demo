/**
 * Tests for services/state.js
 *
 * Tests state management functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('state', () => {
  let state;

  beforeEach(() => {
    // Clear module cache to get fresh state
    const statePath = require.resolve('../../services/state');
    delete require.cache[statePath];
    state = require('../../services/state');
  });

  describe('active session management', () => {
    describe('getActiveSession', () => {
      it('should return null initially', () => {
        expect(state.getActiveSession()).toBeNull();
      });

      it('should return the set session', () => {
        const session = { sessionId: 'test-123', clientId: 'client-1' };
        state.setActiveSession(session);

        expect(state.getActiveSession()).toBe(session);
      });
    });

    describe('setActiveSession', () => {
      it('should set a session object', () => {
        const session = {
          clientId: 'client-1',
          sessionId: 'session-123',
          sessionToken: 'token-abc',
          startedAt: Date.now(),
        };

        state.setActiveSession(session);

        expect(state.getActiveSession()).toEqual(session);
      });

      it('should allow clearing session with null', () => {
        const session = { sessionId: 'test-123' };
        state.setActiveSession(session);
        state.setActiveSession(null);

        expect(state.getActiveSession()).toBeNull();
      });

      it('should overwrite existing session', () => {
        const session1 = { sessionId: 'session-1' };
        const session2 = { sessionId: 'session-2' };

        state.setActiveSession(session1);
        state.setActiveSession(session2);

        expect(state.getActiveSession()).toBe(session2);
      });
    });
  });

  describe('reconnection lock', () => {
    describe('isReconnectionInProgress', () => {
      it('should return false initially', () => {
        expect(state.isReconnectionInProgress()).toBe(false);
      });

      it('should return true after setting to true', () => {
        state.setReconnectionInProgress(true);

        expect(state.isReconnectionInProgress()).toBe(true);
      });
    });

    describe('setReconnectionInProgress', () => {
      it('should set to true', () => {
        state.setReconnectionInProgress(true);

        expect(state.isReconnectionInProgress()).toBe(true);
      });

      it('should set to false', () => {
        state.setReconnectionInProgress(true);
        state.setReconnectionInProgress(false);

        expect(state.isReconnectionInProgress()).toBe(false);
      });
    });

    describe('tryAcquireReconnectionLock', () => {
      it('should acquire lock when not held', () => {
        const acquired = state.tryAcquireReconnectionLock();

        expect(acquired).toBe(true);
        expect(state.isReconnectionInProgress()).toBe(true);
      });

      it('should fail to acquire lock when already held', () => {
        state.setReconnectionInProgress(true);

        const acquired = state.tryAcquireReconnectionLock();

        expect(acquired).toBe(false);
      });

      it('should provide atomic check-and-set behavior', () => {
        // First acquisition should succeed
        expect(state.tryAcquireReconnectionLock()).toBe(true);

        // Second acquisition should fail
        expect(state.tryAcquireReconnectionLock()).toBe(false);

        // Release the lock
        state.setReconnectionInProgress(false);

        // Now acquisition should succeed again
        expect(state.tryAcquireReconnectionLock()).toBe(true);
      });

      it('should prevent race condition in concurrent reconnection attempts', () => {
        // Simulate concurrent attempts
        const results = [];

        // All these would happen in the same event loop tick
        results.push(state.tryAcquireReconnectionLock());
        results.push(state.tryAcquireReconnectionLock());
        results.push(state.tryAcquireReconnectionLock());

        // Only first should succeed
        expect(results).toEqual([true, false, false]);
      });
    });
  });

  describe('disconnect grace timeout', () => {
    describe('getDisconnectGraceTimeout', () => {
      it('should return null initially', () => {
        expect(state.getDisconnectGraceTimeout()).toBeNull();
      });

      it('should return the set timeout', () => {
        const timeout = setTimeout(() => {}, 1000);
        state.setDisconnectGraceTimeout(timeout);

        expect(state.getDisconnectGraceTimeout()).toBe(timeout);

        // Cleanup
        clearTimeout(timeout);
      });
    });

    describe('setDisconnectGraceTimeout', () => {
      it('should set a timeout', () => {
        const timeout = setTimeout(() => {}, 1000);
        state.setDisconnectGraceTimeout(timeout);

        expect(state.getDisconnectGraceTimeout()).toBe(timeout);

        // Cleanup
        clearTimeout(timeout);
      });

      it('should allow setting to null', () => {
        const timeout = setTimeout(() => {}, 1000);
        state.setDisconnectGraceTimeout(timeout);
        state.setDisconnectGraceTimeout(null);

        expect(state.getDisconnectGraceTimeout()).toBeNull();

        // Cleanup
        clearTimeout(timeout);
      });
    });

    describe('clearDisconnectGraceTimeout', () => {
      it('should clear and nullify timeout', () => {
        let callbackCalled = false;
        const timeout = setTimeout(() => {
          callbackCalled = true;
        }, 100);

        state.setDisconnectGraceTimeout(timeout);
        state.clearDisconnectGraceTimeout();

        expect(state.getDisconnectGraceTimeout()).toBeNull();

        // Verify timeout was cleared (callback shouldn't fire)
        return new Promise((resolve) => {
          setTimeout(() => {
            expect(callbackCalled).toBe(false);
            resolve();
          }, 150);
        });
      });

      it('should handle clearing when no timeout set', () => {
        expect(() => state.clearDisconnectGraceTimeout()).not.toThrow();
        expect(state.getDisconnectGraceTimeout()).toBeNull();
      });

      it('should be idempotent', () => {
        const timeout = setTimeout(() => {}, 1000);
        state.setDisconnectGraceTimeout(timeout);

        state.clearDisconnectGraceTimeout();
        state.clearDisconnectGraceTimeout();
        state.clearDisconnectGraceTimeout();

        expect(state.getDisconnectGraceTimeout()).toBeNull();
      });
    });
  });

  describe('shared collections', () => {
    describe('clients', () => {
      it('should be a Map', () => {
        expect(state.clients).toBeInstanceOf(Map);
      });

      it('should be empty initially', () => {
        expect(state.clients.size).toBe(0);
      });

      it('should allow storing client data', () => {
        const clientData = { id: 'client-1', state: 'idle' };
        const ws = { send: vi.fn() };

        state.clients.set(ws, clientData);

        expect(state.clients.get(ws)).toEqual(clientData);
        expect(state.clients.size).toBe(1);
      });
    });

    describe('queue', () => {
      it('should be an array', () => {
        expect(Array.isArray(state.queue)).toBe(true);
      });

      it('should be empty initially', () => {
        expect(state.queue.length).toBe(0);
      });

      it('should allow adding to queue', () => {
        state.queue.push('client-1');
        state.queue.push('client-2');

        expect(state.queue).toEqual(['client-1', 'client-2']);
      });
    });

    describe('sessionTokens', () => {
      it('should be a Map', () => {
        expect(state.sessionTokens).toBeInstanceOf(Map);
      });

      it('should be empty initially', () => {
        expect(state.sessionTokens.size).toBe(0);
      });

      it('should allow storing session tokens', () => {
        state.sessionTokens.set('token-abc', 'session-123');

        expect(state.sessionTokens.get('token-abc')).toBe('session-123');
      });
    });

    describe('pendingSessionTokens', () => {
      it('should be a Map', () => {
        expect(state.pendingSessionTokens).toBeInstanceOf(Map);
      });

      it('should be empty initially', () => {
        expect(state.pendingSessionTokens.size).toBe(0);
      });

      it('should allow storing pending tokens with metadata', () => {
        const pending = {
          clientId: 'client-1',
          inviteToken: 'invite-abc',
          ip: '192.168.1.1',
          createdAt: Date.now(),
        };

        state.pendingSessionTokens.set('pending-token', pending);

        expect(state.pendingSessionTokens.get('pending-token')).toEqual(pending);
      });
    });
  });

  describe('state isolation between tests', () => {
    it('should have fresh state (test 1)', () => {
      state.setActiveSession({ test: 'first' });
      state.clients.set('ws1', { id: 'client-1' });

      expect(state.getActiveSession()).toEqual({ test: 'first' });
      expect(state.clients.size).toBe(1);
    });

    it('should have fresh state (test 2)', () => {
      // This test should not see state from test 1
      // because we reset modules in beforeEach
      expect(state.getActiveSession()).toBeNull();
      expect(state.clients.size).toBe(0);
    });
  });
});
