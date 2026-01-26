/**
 * Tests for routes/health.js
 */

describe('health routes', () => {
  let health;
  let mockApp;
  let mockRedis;
  let state;
  let config;
  let registeredRoutes;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set up mocks before requiring modules
    jest.doMock('../../services/state', () => ({
      queue: [],
      getActiveSession: jest.fn(() => null)
    }));

    jest.doMock('../../config', () => ({
      ENABLED_PLATFORMS: ['confluence', 'jira', 'splunk'],
      MAX_QUEUE_SIZE: 10,
      AVERAGE_SESSION_MINUTES: 45,
      getConfiguredPlatforms: jest.fn(() => ['confluence', 'jira']),
      getScenariosByPlatform: jest.fn(() => ({
        confluence: { page: { title: 'Page Management' } },
        jira: { issue: { title: 'Issue Management' } }
      }))
    }));

    state = require('../../services/state');
    config = require('../../config');
    health = require('../../routes/health');

    registeredRoutes = {};
    mockApp = {
      get: jest.fn((path, handler) => {
        registeredRoutes[path] = handler;
      })
    };

    // Mock Redis client
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG')
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
        set: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    });

    it('should return health status when redis is healthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      await handler(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String),
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira'],
        dependencies: {
          redis: 'healthy'
        }
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
          redis: 'unhealthy'
        }
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
        set: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
    });

    it('should return liveness status', () => {
      handler(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String)
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
        json: jest.fn()
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
        configured_platforms: ['confluence', 'jira']
      });
    });

    it('should return queue status with items', () => {
      state.queue.push('client-1', 'client-2');
      state.getActiveSession.mockReturnValue({ sessionId: 'session-1' });

      handler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        queue_size: 2,
        session_active: true,
        estimated_wait: '90 minutes',  // 2 * 45
        max_queue_size: 10,
        enabled_platforms: ['confluence', 'jira', 'splunk'],
        configured_platforms: ['confluence', 'jira']
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
        json: jest.fn()
      };
    });

    it('should return platform info', () => {
      handler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        enabled: ['confluence', 'jira', 'splunk'],
        configured: ['confluence', 'jira'],
        scenarios: {
          confluence: { page: { title: 'Page Management' } },
          jira: { issue: { title: 'Issue Management' } }
        }
      });
    });
  });
});
