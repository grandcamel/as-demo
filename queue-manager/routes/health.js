/**
 * Health check routes.
 */

const state = require('../services/state');
const config = require('../config');

/**
 * Register health routes.
 * @param {Express} app - Express application
 * @param {Redis} redis - Redis client instance
 */
function register(app, redis) {
  // Helper to check Redis health
  async function checkRedisHealth() {
    try {
      const pong = await redis.ping();
      return pong === 'PONG';
    } catch (_err) {
      return false;
    }
  }

  // Health check (full status with dependencies)
  app.get('/api/health', async (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const redisHealthy = await checkRedisHealth();
    const status = redisHealthy ? 'ok' : 'error';
    const httpStatus = redisHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      enabled_platforms: config.ENABLED_PLATFORMS,
      configured_platforms: config.getConfiguredPlatforms(),
      dependencies: {
        redis: redisHealthy ? 'healthy' : 'unhealthy'
      }
    });
  });

  // Liveness probe - simple check that server is running
  app.get('/api/health/live', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // Readiness probe - checks all dependencies
  app.get('/api/health/ready', async (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const redisHealthy = await checkRedisHealth();
    const httpStatus = redisHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status: redisHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisHealthy ? 'healthy' : 'unhealthy'
      }
    });
  });

  // Queue status (public)
  app.get('/api/status', (req, res) => {
    res.json({
      queue_size: state.queue.length,
      session_active: state.getActiveSession() !== null,
      estimated_wait: state.queue.length * config.AVERAGE_SESSION_MINUTES + ' minutes',
      max_queue_size: config.MAX_QUEUE_SIZE,
      enabled_platforms: config.ENABLED_PLATFORMS,
      configured_platforms: config.getConfiguredPlatforms()
    });
  });

  // Platforms info (public)
  app.get('/api/platforms', (req, res) => {
    const scenarios = config.getScenariosByPlatform();
    res.json({
      enabled: config.ENABLED_PLATFORMS,
      configured: config.getConfiguredPlatforms(),
      scenarios: scenarios
    });
  });
}

module.exports = { register };
