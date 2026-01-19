/**
 * OpenTelemetry metrics utilities for demo platform queue managers.
 *
 * Provides a standardized set of metrics for queue and session management.
 * Gracefully handles cases where OpenTelemetry is not available.
 */

let metrics, trace;
try {
  const api = require('@opentelemetry/api');
  metrics = api.metrics;
  trace = api.trace;
} catch (_e) {
  // OTel not available, will use no-op implementations
}

/**
 * Create a metrics manager for a demo platform queue manager.
 *
 * @param {Object} options - Metrics options
 * @param {string} options.serviceName - Service name (e.g., 'jira-demo-queue-manager')
 * @param {Function} options.getQueueLength - Function returning current queue length
 * @param {Function} options.getActiveSessionCount - Function returning active session count (0 or 1)
 * @returns {Object} Metrics manager with all metric instances
 *
 * @example
 * const metrics = createMetrics({
 *   serviceName: 'jira-demo-queue-manager',
 *   getQueueLength: () => queue.length,
 *   getActiveSessionCount: () => activeSession ? 1 : 0
 * });
 *
 * // Record metrics
 * metrics.sessionsStarted.add(1);
 * metrics.sessionDuration.record(300, { reason: 'timeout' });
 */
function createMetrics(options) {
  const {
    serviceName,
    getQueueLength,
    getActiveSessionCount
  } = options;

  if (!serviceName || typeof serviceName !== 'string') {
    throw new Error('serviceName must be a non-empty string');
  }
  if (typeof getQueueLength !== 'function') {
    throw new Error('getQueueLength must be a function');
  }
  if (typeof getActiveSessionCount !== 'function') {
    throw new Error('getActiveSessionCount must be a function');
  }

  // No-op metric that ignores all calls
  const noopMetric = {
    add: () => {},
    record: () => {},
    addCallback: () => {}
  };

  // Return no-op metrics if OTel not available
  if (!metrics) {
    return {
      // Gauges
      queueSize: noopMetric,
      sessionsActive: noopMetric,
      // Counters
      sessionsStarted: noopMetric,
      sessionsEnded: noopMetric,
      invitesValidated: noopMetric,
      // Histograms
      sessionDuration: noopMetric,
      queueWait: noopMetric,
      ttydSpawn: noopMetric,
      sandboxCleanup: noopMetric,
      // Tracer
      getTracer: () => null
    };
  }

  const meter = metrics.getMeter(serviceName);

  // Gauges (observable)
  const queueSize = meter.createObservableGauge('demo_queue_size', {
    description: 'Current number of clients in queue',
  });

  const sessionsActive = meter.createObservableGauge('demo_sessions_active', {
    description: 'Number of currently active sessions',
  });

  // Register observable callbacks
  queueSize.addCallback((result) => {
    result.observe(getQueueLength());
  });

  sessionsActive.addCallback((result) => {
    result.observe(getActiveSessionCount());
  });

  // Counters
  const sessionsStarted = meter.createCounter('demo_sessions_started_total', {
    description: 'Total number of sessions started',
  });

  const sessionsEnded = meter.createCounter('demo_sessions_ended_total', {
    description: 'Total number of sessions ended',
  });

  const invitesValidated = meter.createCounter('demo_invites_validated_total', {
    description: 'Total number of invite validations',
  });

  // Histograms
  const sessionDuration = meter.createHistogram('demo_session_duration_seconds', {
    description: 'Session duration in seconds',
    unit: 's',
  });

  const queueWait = meter.createHistogram('demo_queue_wait_seconds', {
    description: 'Time spent waiting in queue',
    unit: 's',
  });

  const ttydSpawn = meter.createHistogram('demo_ttyd_spawn_seconds', {
    description: 'Time to spawn ttyd process',
    unit: 's',
  });

  const sandboxCleanup = meter.createHistogram('demo_sandbox_cleanup_seconds', {
    description: 'Sandbox cleanup duration',
    unit: 's',
  });

  // Tracer getter
  const getTracer = () => {
    return trace ? trace.getTracer(serviceName) : null;
  };

  return {
    // Gauges
    queueSize,
    sessionsActive,
    // Counters
    sessionsStarted,
    sessionsEnded,
    invitesValidated,
    // Histograms
    sessionDuration,
    queueWait,
    ttydSpawn,
    sandboxCleanup,
    // Tracer
    getTracer
  };
}

/**
 * Create a tracing span wrapper for common operations.
 *
 * @param {Object} metricsManager - Metrics manager from createMetrics
 * @returns {Object} Span utilities
 *
 * @example
 * const spans = createSpanUtils(metrics);
 *
 * async function startSession() {
 *   return spans.wrap('session.start', { 'session.id': sessionId }, async (span) => {
 *     // ... session start logic
 *     span.setAttribute('session.duration', duration);
 *   });
 * }
 */
function createSpanUtils(metricsManager) {
  const tracer = metricsManager.getTracer();

  /**
   * Wrap an async operation in a tracing span.
   *
   * @param {string} name - Span name
   * @param {Object} attributes - Initial span attributes
   * @param {Function} fn - Async function to execute (receives span as argument)
   * @returns {Promise<*>} Result of the wrapped function
   */
  async function wrap(name, attributes, fn) {
    if (!tracer) {
      return fn(null);
    }

    const span = tracer.startSpan(name, { attributes });
    try {
      const result = await fn(span);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  }

  /**
   * Start a span manually (for operations that need manual end).
   *
   * @param {string} name - Span name
   * @param {Object} [attributes] - Initial span attributes
   * @returns {Object|null} Span or null if tracer not available
   */
  function start(name, attributes = {}) {
    if (!tracer) {
      return null;
    }
    return tracer.startSpan(name, { attributes });
  }

  return {
    wrap,
    start
  };
}

module.exports = {
  createMetrics,
  createSpanUtils
};
