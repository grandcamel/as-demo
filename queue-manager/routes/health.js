/**
 * Health check routes.
 */

const state = require('../services/state');
const config = require('../config');

/**
 * Register health routes.
 * @param {Express} app - Express application
 */
function register(app) {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      enabled_platforms: config.ENABLED_PLATFORMS,
      configured_platforms: config.getConfiguredPlatforms()
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
