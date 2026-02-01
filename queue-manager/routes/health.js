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
        redis: redisHealthy ? 'healthy' : 'unhealthy',
      },
    });
  });

  // Liveness probe - simple check that server is running
  app.get('/api/health/live', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
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
        redis: redisHealthy ? 'healthy' : 'unhealthy',
      },
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
      configured_platforms: config.getConfiguredPlatforms(),
    });
  });

  // Platforms info (public)
  app.get('/api/platforms', (req, res) => {
    const scenarios = config.getScenariosByPlatform();
    res.json({
      enabled: config.ENABLED_PLATFORMS,
      configured: config.getConfiguredPlatforms(),
      scenarios: scenarios,
    });
  });

  // Configuration diagnostics (detailed status for debugging)
  app.get('/api/config/diagnostics', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const diagnostics = [];

    // Check each valid platform
    for (const platformId of config.VALID_PLATFORMS) {
      const isEnabled = config.ENABLED_PLATFORMS.includes(platformId);
      const platformConfig = config.platforms[platformId];
      const isConfigured = platformConfig ? platformConfig.isConfigured() : false;

      // Platform enabled but not configured
      if (isEnabled && !isConfigured) {
        diagnostics.push({
          level: 'error',
          platform: platformId,
          message: `Platform ${platformId} is enabled but not configured (missing credentials)`,
          suggestion: `Set the required environment variables for ${platformId}`,
        });
      }

      // Platform configured but not enabled
      if (!isEnabled && isConfigured) {
        diagnostics.push({
          level: 'info',
          platform: platformId,
          message: `Platform ${platformId} is configured but not enabled`,
          suggestion: `Add ${platformId} to ENABLED_PLATFORMS to activate it`,
        });
      }

      // Platform not configured and not enabled
      if (!isEnabled && !isConfigured) {
        diagnostics.push({
          level: 'info',
          platform: platformId,
          message: `Platform ${platformId} is not configured`,
          suggestion: `Set credentials and add to ENABLED_PLATFORMS to use ${platformId}`,
        });
      }
    }

    // Check for Claude authentication
    if (!config.CLAUDE_CODE_OAUTH_TOKEN && !config.ANTHROPIC_API_KEY) {
      diagnostics.push({
        level: 'warning',
        component: 'auth',
        message: 'No Claude authentication configured',
        suggestion: 'Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY',
      });
    }

    // Check session environment path
    if (!config.SESSION_ENV_HOST_PATH) {
      diagnostics.push({
        level: 'warning',
        component: 'session',
        message: 'SESSION_ENV_HOST_PATH not configured',
        suggestion: 'Set SESSION_ENV_HOST_PATH for secure credential passing to containers',
      });
    }

    // Check for scenario availability
    const scenarioCount = Object.keys(config.SCENARIO_NAMES).length;
    if (scenarioCount === 0) {
      diagnostics.push({
        level: 'warning',
        component: 'scenarios',
        message: 'No scenarios available',
        suggestion: 'Enable at least one platform with valid scenarios',
      });
    }

    // Build summary
    const errors = diagnostics.filter((d) => d.level === 'error');
    const warnings = diagnostics.filter((d) => d.level === 'warning');
    const infos = diagnostics.filter((d) => d.level === 'info');

    const overallStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        errors: errors.length,
        warnings: warnings.length,
        info: infos.length,
      },
      platforms: {
        valid: config.VALID_PLATFORMS,
        enabled: config.ENABLED_PLATFORMS,
        configured: config.getConfiguredPlatforms(),
      },
      scenarios: {
        count: scenarioCount,
        byPlatform: config.getScenariosByPlatform(),
      },
      diagnostics,
    });
  });
}

module.exports = { register };
