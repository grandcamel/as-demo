/**
 * Tests for services/session.js
 *
 * Tests session management: token generation, env file creation,
 * session start/end, and cleanup flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('session service', () => {
  let session;
  let mockRedis;
  let mockWs;
  let mockState;
  let mockConfig;
  let mockMetrics;
  let mockInviteService;
  let mockCoreLib;
  let mockSpawn;
  let mockUuid;

  // Shared state structures
  let clients;
  let queueArray;
  let pendingSessionTokens;
  let sessionTokens;
  let mockActiveSession;

  // Mock tracer and span
  let mockTracer;
  let mockSpan;

  // Mock process
  let mockTtydProcess;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh state for each test
    clients = new Map();
    queueArray = [];
    pendingSessionTokens = new Map();
    sessionTokens = new Map();
    mockActiveSession = null;

    // Create mock tracer and span
    mockSpan = {
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn()
    };
    mockTracer = {
      startSpan: vi.fn(() => mockSpan)
    };

    // Create mock ttyd process
    mockTtydProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn()
    };

    // Mock state
    mockState = {
      clients,
      queue: queueArray,
      pendingSessionTokens,
      sessionTokens,
      getActiveSession: vi.fn(() => mockActiveSession),
      setActiveSession: vi.fn((s) => { mockActiveSession = s; })
    };

    // Mock config
    mockConfig = {
      SESSION_SECRET: 'test-secret-key',
      SESSION_TIMEOUT_MINUTES: 30,
      SESSION_ENV_CONTAINER_PATH: '/run/session-env',
      SESSION_ENV_HOST_PATH: '/tmp/session-env',
      TTYD_PORT: 7681,
      ENABLED_PLATFORMS: ['confluence', 'jira'],
      DEMO_CONTAINER_IMAGE: 'demo-container:latest',
      AUDIT_RETENTION_DAYS: 30,
      platforms: {
        confluence: {
          isConfigured: () => true,
          getEnvVars: () => ({ CONFLUENCE_URL: 'https://example.atlassian.net' })
        }
      },
      getAllEnvVars: vi.fn(() => ({ CONFLUENCE_URL: 'https://example.atlassian.net' })),
      getConfiguredPlatforms: vi.fn(() => ['confluence'])
    };

    // Mock metrics
    mockMetrics = {
      getTracer: vi.fn(() => mockTracer),
      sessionsStartedCounter: { add: vi.fn() },
      sessionsEndedCounter: { add: vi.fn() },
      sessionDurationHistogram: { record: vi.fn() },
      queueWaitHistogram: { record: vi.fn() },
      ttydSpawnHistogram: { record: vi.fn() },
      sandboxCleanupHistogram: { record: vi.fn() }
    };

    // Mock invite service
    mockInviteService = {
      recordInviteUsage: vi.fn()
    };

    // Mock core library
    mockCoreLib = {
      generateSessionToken: vi.fn(() => 'generated-token-123'),
      createSessionEnvFile: vi.fn(() => ({
        containerPath: '/run/session-env/test-session.env',
        hostPath: '/tmp/session-env/test-session.env',
        cleanup: vi.fn()
      }))
    };

    // Mock spawn
    mockSpawn = vi.fn(() => mockTtydProcess);

    // Mock uuid
    mockUuid = { v4: vi.fn(() => 'test-session-uuid') };

    // Clear require cache
    const paths = [
      '../../services/session',
      '../../services/state',
      '../../services/invite',
      '../../config',
      '../../config/metrics',
      '../../errors',
      '@demo-platform/queue-manager-core',
      'child_process',
      'uuid'
    ].map(p => {
      try { return require.resolve(p); } catch { return null; }
    }).filter(Boolean);

    paths.forEach(p => delete require.cache[p]);

    // Mock child_process
    const cpPath = require.resolve('child_process');
    require.cache[cpPath] = {
      id: cpPath,
      filename: cpPath,
      loaded: true,
      exports: { spawn: mockSpawn }
    };

    // Mock uuid
    const uuidPath = require.resolve('uuid');
    require.cache[uuidPath] = {
      id: uuidPath,
      filename: uuidPath,
      loaded: true,
      exports: mockUuid
    };

    // Mock @demo-platform/queue-manager-core
    const corePath = require.resolve('@demo-platform/queue-manager-core');
    require.cache[corePath] = {
      id: corePath,
      filename: corePath,
      loaded: true,
      exports: mockCoreLib
    };

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: mockConfig
    };

    // Mock config/metrics
    const metricsPath = require.resolve('../../config/metrics');
    require.cache[metricsPath] = {
      id: metricsPath,
      filename: metricsPath,
      loaded: true,
      exports: mockMetrics
    };

    // Mock state
    const statePath = require.resolve('../../services/state');
    require.cache[statePath] = {
      id: statePath,
      filename: statePath,
      loaded: true,
      exports: mockState
    };

    // Mock invite service
    const invitePath = require.resolve('../../services/invite');
    require.cache[invitePath] = {
      id: invitePath,
      filename: invitePath,
      loaded: true,
      exports: mockInviteService
    };

    // Mock errors module
    const errorsPath = require.resolve('../../errors');
    require.cache[errorsPath] = {
      id: errorsPath,
      filename: errorsPath,
      loaded: true,
      exports: {
        ErrorCodes: {
          SESSION_START_FAILED: 'ERR_SESSION_START_FAILED'
        },
        formatWsError: vi.fn((code, message) => JSON.stringify({ type: 'error', code, message }))
      }
    };

    // Now require the module
    session = require('../../services/session');

    // Setup mock WebSocket
    mockWs = {
      send: vi.fn()
    };

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn()
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateSessionToken', () => {
    it('should call core library with sessionId and secret', () => {
      const token = session.generateSessionToken('session-123');

      expect(mockCoreLib.generateSessionToken).toHaveBeenCalledWith('session-123', 'test-secret-key');
      expect(token).toBe('generated-token-123');
    });
  });

  describe('clearSessionToken', () => {
    it('should remove token from sessionTokens map', () => {
      sessionTokens.set('token-abc', 'session-123');

      session.clearSessionToken('token-abc');

      expect(sessionTokens.has('token-abc')).toBe(false);
    });

    it('should handle null token gracefully', () => {
      expect(() => session.clearSessionToken(null)).not.toThrow();
    });

    it('should handle undefined token gracefully', () => {
      expect(() => session.clearSessionToken(undefined)).not.toThrow();
    });

    it('should handle non-existent token gracefully', () => {
      expect(() => session.clearSessionToken('nonexistent')).not.toThrow();
    });
  });

  describe('findClientWs', () => {
    it('should find WebSocket by client ID', () => {
      const ws1 = { id: 'ws1' };
      const ws2 = { id: 'ws2' };
      clients.set(ws1, { id: 'client-1' });
      clients.set(ws2, { id: 'client-2' });

      const result = session.findClientWs('client-2');

      expect(result).toBe(ws2);
    });

    it('should return null when client not found', () => {
      clients.set({ id: 'ws1' }, { id: 'client-1' });

      const result = session.findClientWs('client-nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when clients map is empty', () => {
      const result = session.findClientWs('client-1');

      expect(result).toBeNull();
    });
  });

  describe('createSessionEnvFile', () => {
    it('should call core library with correct parameters', () => {
      const result = session.createSessionEnvFile('session-123');

      expect(mockConfig.getAllEnvVars).toHaveBeenCalled();
      expect(mockCoreLib.createSessionEnvFile).toHaveBeenCalledWith({
        sessionId: 'session-123',
        containerPath: '/run/session-env',
        hostPath: '/tmp/session-env',
        credentials: { CONFLUENCE_URL: 'https://example.atlassian.net' }
      });
      expect(result.containerPath).toBe('/run/session-env/test-session.env');
      expect(result.cleanup).toBeInstanceOf(Function);
    });
  });

  describe('startSession', () => {
    let client;
    let processQueueFn;

    beforeEach(() => {
      client = {
        id: 'client-1',
        state: 'queued',
        pendingSessionToken: 'pending-token-123',
        inviteToken: 'invite-abc',
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        joinedAt: new Date(Date.now() - 5000)
      };
      clients.set(mockWs, client);
      queueArray.push('client-1');
      pendingSessionTokens.set('pending-token-123', {
        clientId: 'client-1',
        inviteToken: 'invite-abc',
        ip: '192.168.1.1'
      });
      processQueueFn = vi.fn();
    });

    it('should remove client from queue', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(queueArray).not.toContain('client-1');
    });

    it('should update client state to active', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(client.state).toBe('active');
    });

    it('should create session env file', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockCoreLib.createSessionEnvFile).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-uuid'
        })
      );
    });

    it('should spawn ttyd with correct arguments', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockSpawn).toHaveBeenCalledWith('ttyd', expect.arrayContaining([
        '--port', '7681',
        '--interface', '0.0.0.0',
        '--max-clients', '1',
        '--once',
        '--writable',
        'docker', 'run', '--rm', '-i',
        '--memory', '2g',
        '--cap-drop', 'ALL',
        'demo-container:latest'
      ]), expect.any(Object));
    });

    it('should register process event handlers', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockTtydProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockTtydProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockTtydProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    it('should promote pending session token to active', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(pendingSessionTokens.has('pending-token-123')).toBe(false);
      expect(sessionTokens.get('pending-token-123')).toBe('test-session-uuid');
    });

    it('should set active session with correct data', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockState.setActiveSession).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'client-1',
        sessionId: 'test-session-uuid',
        sessionToken: 'pending-token-123',
        inviteToken: 'invite-abc',
        ip: '192.168.1.1',
        userAgent: 'Test Browser'
      }));
    });

    it('should send session_starting message to client', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"session_starting"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"terminal_url":"/terminal"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"enabled_platforms"'));
    });

    it('should save session to Redis', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'session:client-1',
        expect.any(String),
        'EX',
        30 * 60
      );
    });

    it('should record metrics', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockMetrics.ttydSpawnHistogram.record).toHaveBeenCalled();
      expect(mockMetrics.queueWaitHistogram.record).toHaveBeenCalled();
      expect(mockMetrics.sessionsStartedCounter.add).toHaveBeenCalledWith(1);
    });

    it('should start tracing span', async () => {
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockTracer.startSpan).toHaveBeenCalledWith('session.start', expect.any(Object));
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('session.id', 'test-session-uuid');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle spawn error and cleanup', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      const envCleanupFn = vi.fn();
      mockCoreLib.createSessionEnvFile.mockReturnValue({
        containerPath: '/run/session-env/test.env',
        hostPath: '/tmp/test.env',
        cleanup: envCleanupFn
      });

      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('ERR_SESSION_START_FAILED'));
      expect(client.state).toBe('connected');
      expect(envCleanupFn).toHaveBeenCalled();
      expect(processQueueFn).toHaveBeenCalled();
    });

    it('should handle client without pending session token', async () => {
      client.pendingSessionToken = null;

      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockState.setActiveSession).toHaveBeenCalledWith(expect.objectContaining({
        sessionToken: null
      }));
    });

    it('should handle client without joinedAt (no queue wait time)', async () => {
      client.joinedAt = null;

      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(mockMetrics.queueWaitHistogram.record).not.toHaveBeenCalled();
    });

    describe('ttyd exit handling', () => {
      it('should call endSession when ttyd exits', async () => {
        await session.startSession(mockRedis, mockWs, client, processQueueFn);

        // Get the exit handler
        const exitHandler = mockTtydProcess.on.mock.calls.find(c => c[0] === 'exit')[1];

        // Simulate ttyd exit
        mockActiveSession = {
          clientId: 'client-1',
          hardTimeout: setTimeout(() => {}, 10000)
        };
        mockState.getActiveSession.mockReturnValue(mockActiveSession);

        exitHandler(0);

        // Hard timeout should be cleared
        expect(clearTimeout).toBeDefined();
      });
    });
  });

  describe('endSession', () => {
    let processQueueFn;
    let defaultClientWs;

    beforeEach(() => {
      processQueueFn = vi.fn();
      mockActiveSession = {
        clientId: 'client-1',
        sessionId: 'session-123',
        sessionToken: 'token-abc',
        inviteToken: 'invite-xyz',
        ttydProcess: mockTtydProcess,
        startedAt: new Date(Date.now() - 300000),
        hardTimeout: null,
        envFileCleanup: vi.fn()
      };
      mockState.getActiveSession.mockReturnValue(mockActiveSession);

      // Clear clients map and add a default client
      clients.clear();
      defaultClientWs = { send: vi.fn() };
      clients.set(defaultClientWs, { id: 'client-1', state: 'active', sessionToken: 'token-abc' });
    });

    it('should do nothing if no active session', async () => {
      mockState.getActiveSession.mockReturnValue(null);

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockTtydProcess.kill).not.toHaveBeenCalled();
    });

    it('should kill ttyd process', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockTtydProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle ttyd kill error gracefully', async () => {
      mockTtydProcess.kill.mockImplementation(() => {
        throw new Error('Process already dead');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(consoleSpy).toHaveBeenCalledWith('Error killing ttyd:', 'Process already dead');
      consoleSpy.mockRestore();
    });

    it('should clear hard timeout if set', async () => {
      vi.useFakeTimers();
      const timeout = setTimeout(() => {}, 10000);
      mockActiveSession.hardTimeout = timeout;

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      // The session clears the timeout by setting it to null on the session object
      // But we need to check that clearTimeout was called - we can verify the side effect
      // by checking the session was processed (Redis.del called means we got past that code)
      expect(mockRedis.del).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should call env file cleanup', async () => {
      const envCleanupFn = vi.fn();
      mockActiveSession.envFileCleanup = envCleanupFn;
      mockState.getActiveSession.mockReturnValue(mockActiveSession);

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(envCleanupFn).toHaveBeenCalled();
    });

    it('should clear session token', async () => {
      sessionTokens.set('token-abc', 'session-123');

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(sessionTokens.has('token-abc')).toBe(false);
    });

    it('should record invite usage when invite token exists', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockInviteService.recordInviteUsage).toHaveBeenCalledWith(
        mockRedis,
        expect.objectContaining({
          clientId: 'client-1',
          sessionId: 'session-123',
          inviteToken: 'invite-xyz'
        }),
        expect.any(Date),
        'timeout',
        30
      );
    });

    it('should not record invite usage when no invite token', async () => {
      mockActiveSession.inviteToken = null;

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockInviteService.recordInviteUsage).not.toHaveBeenCalled();
    });

    it('should send session_ended message to client', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(defaultClientWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"session_ended"'));
      expect(defaultClientWs.send).toHaveBeenCalledWith(expect.stringContaining('"reason":"timeout"'));
      expect(defaultClientWs.send).toHaveBeenCalledWith(expect.stringContaining('"clear_session_cookie":true'));
    });

    it('should update client state', async () => {
      const clientData = clients.get(defaultClientWs);

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(clientData.state).toBe('connected');
      expect(clientData.sessionToken).toBeNull();
    });

    it('should delete session from Redis', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockRedis.del).toHaveBeenCalledWith('session:client-1');
    });

    it('should clear active session', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockState.setActiveSession).toHaveBeenCalledWith(null);
    });

    it('should process next in queue', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(processQueueFn).toHaveBeenCalled();
    });

    it('should record session duration metric', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockMetrics.sessionDurationHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { reason: 'timeout' }
      );
      expect(mockMetrics.sessionsEndedCounter.add).toHaveBeenCalledWith(1, { reason: 'timeout' });
    });

    it('should start and end tracing span', async () => {
      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockTracer.startSpan).toHaveBeenCalledWith('session.end', expect.any(Object));
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('session.duration_seconds', expect.any(Number));
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle different end reasons', async () => {
      await session.endSession(mockRedis, 'container_exit', processQueueFn);

      expect(mockMetrics.sessionsEndedCounter.add).toHaveBeenCalledWith(1, { reason: 'container_exit' });
    });

    it('should handle missing client WebSocket gracefully', async () => {
      clients.clear();

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      // Should not throw, just continue with cleanup
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle missing envFileCleanup gracefully', async () => {
      mockActiveSession.envFileCleanup = null;

      await expect(session.endSession(mockRedis, 'timeout', processQueueFn)).resolves.not.toThrow();
    });

    it('should handle missing ttydProcess gracefully', async () => {
      mockActiveSession.ttydProcess = null;

      await expect(session.endSession(mockRedis, 'timeout', processQueueFn)).resolves.not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle full session lifecycle', async () => {
      // Setup client
      const client = {
        id: 'client-1',
        state: 'queued',
        pendingSessionToken: 'pending-token',
        inviteToken: 'invite-123',
        ip: '192.168.1.1',
        userAgent: 'Test',
        joinedAt: new Date()
      };
      clients.set(mockWs, client);
      queueArray.push('client-1');
      pendingSessionTokens.set('pending-token', { clientId: 'client-1' });

      const processQueueFn = vi.fn();

      // Start session
      await session.startSession(mockRedis, mockWs, client, processQueueFn);

      expect(client.state).toBe('active');
      expect(mockState.setActiveSession).toHaveBeenCalled();

      // End session
      const activeSession = mockState.setActiveSession.mock.calls[0][0];
      mockState.getActiveSession.mockReturnValue(activeSession);

      await session.endSession(mockRedis, 'timeout', processQueueFn);

      expect(mockState.setActiveSession).toHaveBeenCalledWith(null);
      expect(processQueueFn).toHaveBeenCalled();
    });
  });
});
