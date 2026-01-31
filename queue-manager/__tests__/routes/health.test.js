/**
 * Tests for routes/health.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('health routes', () => {
  let health;
  let mockApp;
  let mockRedis;
  let state;
  let config;
  let registeredRoutes;

  // Shared mock state
  let queueArray;
  let mockGetActiveSession;
  let mockGetConfiguredPlatforms;
  let mockGetScenariosByPlatform;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh state
    queueArray = [];
    mockGetActiveSession = vi.fn(() => null);
    mockGetConfiguredPlatforms = vi.fn(() => ['confluence', 'jira']);
    mockGetScenariosByPlatform = vi.fn(() => ({
      confluence: { page: { title: 'Page Management' } },
      jira: { issue: { title: 'Issue Management' } },
    }));

    // Clear require cache
    const paths = ['../../routes/health', '../../services/state', '../../config']
      .map((p) => {
        try {
          return require.resolve(p);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    paths.forEach((p) => delete require.cache[p]);

    // Mock state
    const statePath = require.resolve('../../services/state');
    require.cache[statePath] = {
      id: statePath,
      filename: statePath,
      loaded: true,
      exports: {
        queue: queueArray,
        getActiveSession: mockGetActiveSession,
      },
    };

    // Mock config
    const configPath = require.resolve('../../config');
    require.cache[configPath] = {
      id: configPath,
      filename: configPath,
      loaded: true,
      exports: {
        ENABLED_PLATFORMS: ['confluence', 'jira', 'splunk'],
        MAX_QUEUE_SIZE: 10,
        AVERAGE_SESSION_MINUTES: 45,
        getConfiguredPlatforms: mockGetConfiguredPlatforms,
        getScenariosByPlatform: mockGetScenariosByPlatform,
      },
    };

    // Import modules
    state = require('../../services/state');
    config = require('../../config');
    health = require('../../routes/health');

    registeredRoutes = {};
    mockApp = {
      get: vi.fn((path, handler) => {
        registeredRoutes[path] = handler;
      }),
    };

    // Mock Redis client
    mockRedis = {
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    health.register(mockApp, mockRedis);
  });

  describe('register', () => {
    it('should register /api/health route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/health', expect.any(Function));
    });

    it('should register /api/health/live route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/health/live', expect.any(Function));
    });

    it('should register /api/health/ready route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/health/ready', expect.any(Function));
    });

    it('should register /api/status route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/status', expect.any(Function));
    });

    it('should register /api/platforms route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/platforms', expect.any(Function));
    });
  });

  describe('GET /api/health', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/health'];
      mockReq = {};
      mockRes = {
        set: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    });

    it('should return health status when redis is healthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      await handler(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String),
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira'],
        dependencies: {
          redis: 'healthy',
        },
      });
    });

    it('should return error status when redis is unhealthy', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        timestamp: expect.any(String),
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira'],
        dependencies: {
          redis: 'unhealthy',
        },
      });
    });

    it('should return ISO timestamp', async () => {
      await handler(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
    });
  });

  describe('GET /api/health/live', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/health/live'];
      mockReq = {};
      mockRes = {
        set: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    });

    it('should return liveness status', () => {
      handler(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/status', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/status'];
      mockReq = {};
      mockRes = {
        json: vi.fn(),
      };
    });

    it('should return queue status when empty', () => {
      state.queue.length = 0;
      state.getActiveSession.mockReturnValue(null);

      handler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        queue_size: 0,
        session_active: false,
        estimated_wait: '0 minutes',
        max_queue_size: 10,
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira'],
      });
    });

    it('should return queue status with items', () => {
      state.queue.push('client-1', 'client-2');
      state.getActiveSession.mockReturnValue({ sessionId: 'session-1' });

      handler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        queue_size: 2,
        session_active: true,
        estimated_wait: '90 minutes', // 2 * 45
        max_queue_size: 10,
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira'],
      });
    });
  });

  describe('GET /api/platforms', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/platforms'];
      mockReq = {};
      mockRes = {
        json: vi.fn(),
      };
    });

    it('should return platform info', () => {
      handler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        enabled: ['confluence', 'jira', 'splunk'],
        configured: ['confluence', 'jira'],
        scenarios: {
          confluence: { page: { title: 'Page Management' } },
          jira: { issue: { title: 'Issue Management' } },
        },
      });
    });
  });
});
