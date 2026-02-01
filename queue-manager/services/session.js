/**
 * Session management service.
 *
 * Uses @demo-platform/queue-manager-core for session tokens and env files.
 * Supports multi-platform configuration (Confluence, JIRA, Splunk).
 *
 * Dependency Injection:
 * - Functions accept an optional `deps` parameter for testability
 * - Use createDefaultDeps() to get default dependencies
 * - Pass custom deps for unit testing without mocking modules
 */

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const {
  generateSessionToken: coreGenerateToken,
  createSessionEnvFile: coreCreateEnvFile,
} = require('@demo-platform/queue-manager-core');

const config = require('../config');
const {
  getTracer,
  sessionsStartedCounter,
  sessionsEndedCounter,
  sessionDurationHistogram,
  queueWaitHistogram,
  ttydSpawnHistogram,
  sandboxCleanupHistogram,
} = require('../config/metrics');
const state = require('./state');
const { recordInviteUsage } = require('./invite');
const { ErrorCodes, formatWsError } = require('../errors');

/**
 * Create default dependencies for session service.
 * Override any of these in tests for mocking.
 * @returns {Object} Default dependencies
 */
function createDefaultDeps() {
  return {
    config,
    state,
    spawn,
    uuidv4,
    coreGenerateToken,
    coreCreateEnvFile,
    getTracer,
    metrics: {
      sessionsStartedCounter,
      sessionsEndedCounter,
      sessionDurationHistogram,
      queueWaitHistogram,
      ttydSpawnHistogram,
      sandboxCleanupHistogram,
    },
    recordInviteUsage,
    ErrorCodes,
    formatWsError,
  };
}

/**
 * Generate a session token.
 * @param {string} sessionId - Session ID
 * @returns {string} Session token
 */
function generateSessionToken(sessionId) {
  return coreGenerateToken(sessionId, config.SESSION_SECRET);
}

/**
 * Clear a session token.
 * @param {string} sessionToken - Token to clear
 */
function clearSessionToken(sessionToken) {
  if (sessionToken) {
    state.sessionTokens.delete(sessionToken);
  }
}

/**
 * Find WebSocket for a client ID.
 * @param {string} clientId - Client ID to find
 * @param {Object} [st] - Optional state object for testing
 * @returns {WebSocket|null} WebSocket or null
 */
function findClientWs(clientId, st = state) {
  for (const [ws, client] of st.clients.entries()) {
    if (client.id === clientId) {
      return ws;
    }
  }
  return null;
}

/**
 * Create a session environment file with credentials for ALL enabled platforms.
 * Uses secure permissions (0600) so only root can read.
 * @param {string} sessionId - Session ID
 * @returns {Object} { containerPath, hostPath, cleanup }
 */
function createSessionEnvFile(sessionId) {
  // Get all environment variables from enabled platforms
  const envVars = config.getAllEnvVars();

  return coreCreateEnvFile({
    sessionId: sessionId,
    containerPath: config.SESSION_ENV_CONTAINER_PATH,
    hostPath: config.SESSION_ENV_HOST_PATH,
    credentials: envVars,
  });
}

/**
 * Run sandbox cleanup scripts for all configured platforms.
 * @param {Object} [deps] - Optional dependencies for testing
 */
function runSandboxCleanup(deps = createDefaultDeps()) {
  const { config: cfg, spawn: spawnFn, metrics } = deps;
  const tracer = deps.getTracer();
  const configuredPlatforms = cfg.getConfiguredPlatforms();

  for (const platform of configuredPlatforms) {
    const span = tracer?.startSpan(`sandbox.cleanup.${platform}`);
    const startTime = Date.now();

    console.log(`Running ${platform} sandbox cleanup...`);

    // Build platform-specific environment
    const platformConfig = cfg.platforms[platform];
    const platformEnv = {
      ...process.env,
      ...platformConfig.getEnvVars(),
      OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
    };

    const scriptPath = `/opt/scripts/cleanup_${platform}_sandbox.py`;
    const cleanup = spawnFn('python3', [scriptPath], { env: platformEnv });

    cleanup.on('exit', (code) => {
      const durationSeconds = (Date.now() - startTime) / 1000;
      metrics.sandboxCleanupHistogram?.record(durationSeconds, {
        success: code === 0 ? 'true' : 'false',
        platform: platform,
      });
      span?.setAttribute('sandbox.cleanup_duration_seconds', durationSeconds);
      span?.setAttribute('sandbox.cleanup_success', code === 0);
      span?.setAttribute('sandbox.platform', platform);

      if (code === 0) {
        console.log(`${platform} sandbox cleanup completed successfully`);
      } else {
        console.error(`${platform} sandbox cleanup failed with code ${code}`);
        span?.recordException(new Error(`Cleanup failed with code ${code}`));
      }
      span?.end();
    });

    cleanup.on('error', (err) => {
      // Script may not exist for all platforms, that's OK
      if (err.code === 'ENOENT') {
        console.log(`No cleanup script for ${platform} (${scriptPath})`);
      } else {
        console.error(`Error running ${platform} cleanup:`, err.message);
      }
      span?.end();
    });
  }
}

/**
 * Start a new session.
 * @param {Object} redis - Redis client
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} client - Client object
 * @param {Function} processQueue - Queue processing callback
 * @param {Object} [deps] - Optional dependencies for testing
 */
async function startSession(redis, ws, client, processQueue, deps = createDefaultDeps()) {
  const { config: cfg, state: st, spawn: spawnFn, uuidv4: uuid, metrics } = deps;
  const tracer = deps.getTracer();
  const span = tracer?.startSpan('session.start', {
    attributes: {
      'session.client_id': client.id,
      'session.invite_token': client.inviteToken ? client.inviteToken.slice(0, 8) : 'none',
      'session.enabled_platforms': config.ENABLED_PLATFORMS.join(','),
    },
  });

  console.log(`Starting session for client ${client.id}`);
  console.log(`Enabled platforms: ${cfg.ENABLED_PLATFORMS.join(', ')}`);
  const spawnStartTime = Date.now();
  const sessionId = uuid();
  let envFileCleanup = null;

  try {
    // Remove from queue
    const queueIndex = st.queue.indexOf(client.id);
    if (queueIndex !== -1) {
      st.queue.splice(queueIndex, 1);
    }

    client.state = 'active';

    // Create session env file with ALL platform credentials
    const envFile = createSessionEnvFile(sessionId);
    envFileCleanup = envFile.cleanup;

    // Start ttyd with demo container
    // Sensitive env vars are passed via --env-file (not visible in ps aux)
    const ttydProcess = spawnFn(
      'ttyd',
      [
        '--port',
        String(config.TTYD_PORT),
        '--interface',
        '0.0.0.0',
        '--max-clients',
        '1',
        '--once',
        '--writable',
        '--client-option',
        'reconnect=0',
        'docker',
        'run',
        '--rm',
        '-i',
        // Security constraints for spawned containers
        '--memory',
        '2g',
        '--memory-swap',
        '2g',
        '--cpus',
        '2',
        '--pids-limit',
        '256',
        '--security-opt',
        'no-new-privileges:true',
        // Note: Docker applies default seccomp profile automatically
        // Explicit 'seccomp=default' fails on some Docker installations
        '--cap-drop',
        'ALL',
        '--cap-add',
        'CHOWN',
        '--cap-add',
        'SETUID',
        '--cap-add',
        'SETGID',
        '--cap-add',
        'DAC_OVERRIDE',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=512m',
        '--tmpfs',
        '/home/devuser:rw,noexec,nosuid,size=256m,uid=1000,gid=1000',
        // Environment configuration
        '--env-file',
        envFile.containerPath,
        '-e',
        'TERM=xterm',
        '-e',
        `SESSION_TIMEOUT_MINUTES=${cfg.SESSION_TIMEOUT_MINUTES}`,
        '-e',
        `ENABLED_PLATFORMS=${cfg.ENABLED_PLATFORMS.join(',')}`,
        '-e',
        `ENABLE_AUTOPLAY=${process.env.ENABLE_AUTOPLAY || 'false'}`,
        '-e',
        `AUTOPLAY_DEBUG=${process.env.AUTOPLAY_DEBUG || 'false'}`,
        '-e',
        `AUTOPLAY_SHOW_TOOLS=${process.env.AUTOPLAY_SHOW_TOOLS || 'false'}`,
        '-e',
        `OTEL_ENDPOINT=${process.env.OTEL_ENDPOINT || ''}`,
        cfg.DEMO_CONTAINER_IMAGE,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    // Log ttyd stdout/stderr for debugging
    ttydProcess.stdout.on('data', (data) => {
      console.log(`[ttyd stdout] ${data.toString().trim()}`);
    });
    ttydProcess.stderr.on('data', (data) => {
      console.log(`[ttyd stderr] ${data.toString().trim()}`);
    });

    // Record spawn time
    const spawnDuration = (Date.now() - spawnStartTime) / 1000;
    metrics.ttydSpawnHistogram?.record(spawnDuration);
    span?.setAttribute('ttyd.spawn_seconds', spawnDuration);

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + cfg.SESSION_TIMEOUT_MINUTES * 60 * 1000);
    const queueWaitMs = client.joinedAt ? startedAt - client.joinedAt : 0;

    // Record queue wait time
    if (queueWaitMs > 0) {
      metrics.queueWaitHistogram?.record(queueWaitMs / 1000);
      span?.setAttribute('session.queue_wait_seconds', queueWaitMs / 1000);
    }

    // Promote pending session token to active session token
    const sessionToken = client.pendingSessionToken;
    if (sessionToken) {
      st.pendingSessionTokens.delete(sessionToken);
      st.sessionTokens.set(sessionToken, sessionId);
    }

    const activeSession = {
      clientId: client.id,
      sessionId: sessionId,
      sessionToken: sessionToken,
      ttydProcess: ttydProcess,
      startedAt: startedAt,
      expiresAt: expiresAt,
      inviteToken: client.inviteToken || null,
      ip: client.ip,
      userAgent: client.userAgent,
      queueWaitMs: queueWaitMs,
      errors: [],
      envFileCleanup: envFileCleanup,
    };

    st.setActiveSession(activeSession);

    // Transfer ownership of envFileCleanup to activeSession
    // This prevents double-cleanup if an error occurs after this point
    envFileCleanup = null;

    // Handle ttyd exit
    ttydProcess.on('exit', (code) => {
      console.log(`ttyd exited with code ${code}`);
      const currentSession = st.getActiveSession();
      // Clear hard timeout since process exited normally
      if (currentSession && currentSession.hardTimeout) {
        clearTimeout(currentSession.hardTimeout);
        currentSession.hardTimeout = null;
      }
      if (currentSession && currentSession.clientId === client.id) {
        endSession(redis, 'container_exit', processQueue, deps);
      }
    });

    // Hard timeout: force-kill ttyd if still running after session timeout + 5 min grace
    const hardTimeoutMs = (cfg.SESSION_TIMEOUT_MINUTES + 5) * 60 * 1000;
    const hardTimeout = setTimeout(() => {
      const currentSession = st.getActiveSession();
      if (currentSession && currentSession.ttydProcess && currentSession.clientId === client.id) {
        console.log(`Hard timeout reached for session ${sessionId}, force-killing ttyd`);
        try {
          currentSession.ttydProcess.kill('SIGKILL');
        } catch (err) {
          console.error('Error force-killing ttyd:', err.message);
        }
      }
    }, hardTimeoutMs);

    activeSession.hardTimeout = hardTimeout;

    // Notify client
    ws.send(
      JSON.stringify({
        type: 'session_starting',
        terminal_url: '/terminal',
        expires_at: expiresAt.toISOString(),
        session_token: sessionToken,
        enabled_platforms: cfg.ENABLED_PLATFORMS,
      })
    );

    // Schedule warning and timeout
    scheduleSessionWarning(ws, client, cfg);
    scheduleSessionTimeout(redis, client, processQueue, deps);

    // Save to Redis for persistence
    await redis.set(
      `session:${client.id}`,
      JSON.stringify({
        sessionId: sessionId,
        startedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        inviteToken: client.inviteToken || null,
        ip: client.ip,
        userAgent: client.userAgent,
        queueWaitMs: queueWaitMs,
        enabledPlatforms: cfg.ENABLED_PLATFORMS,
      }),
      'EX',
      cfg.SESSION_TIMEOUT_MINUTES * 60
    );

    // Record metrics
    metrics.sessionsStartedCounter?.add(1);
    span?.setAttribute('session.id', sessionId);

    console.log(`Session started for ${client.id}, expires at ${expiresAt.toISOString()}`);

    span?.end();
  } catch (err) {
    console.error('Failed to start session:', err);
    span?.recordException(err);
    span?.end();
    ws.send(
      deps.formatWsError(deps.ErrorCodes.SESSION_START_FAILED, 'Failed to start demo session')
    );
    client.state = 'connected';

    // Clean up env file if it was created
    if (envFileCleanup) {
      envFileCleanup();
    }

    // Try next in queue
    processQueue();
  }
}

function scheduleSessionWarning(ws, client, cfg = config) {
  const warningTime = (cfg.SESSION_TIMEOUT_MINUTES - 5) * 60 * 1000;

  setTimeout(() => {
    const activeSession = state.getActiveSession();
    if (activeSession && activeSession.clientId === client.id) {
      ws.send(
        JSON.stringify({
          type: 'session_warning',
          minutes_remaining: 5,
        })
      );
    }
  }, warningTime);
}

function scheduleSessionTimeout(redis, client, processQueue, deps = createDefaultDeps()) {
  const timeoutMs = deps.config.SESSION_TIMEOUT_MINUTES * 60 * 1000;

  setTimeout(() => {
    const activeSession = deps.state.getActiveSession();
    if (activeSession && activeSession.clientId === client.id) {
      endSession(redis, 'timeout', processQueue, deps);
    }
  }, timeoutMs);
}

/**
 * End the current session.
 * @param {Object} redis - Redis client
 * @param {string} reason - End reason
 * @param {Function} processQueue - Queue processing callback
 * @param {Object} [deps] - Optional dependencies for testing
 */
async function endSession(redis, reason, processQueue, deps = createDefaultDeps()) {
  const { config: cfg, state: st, metrics } = deps;
  const activeSession = st.getActiveSession();
  if (!activeSession) return;

  const tracer = deps.getTracer();
  const span = tracer?.startSpan('session.end', {
    attributes: {
      'session.id': activeSession.sessionId,
      'session.client_id': activeSession.clientId,
      'session.end_reason': reason,
    },
  });

  const clientId = activeSession.clientId;
  const endedAt = new Date();
  const durationMs = endedAt - activeSession.startedAt;
  console.log(`Ending session for ${clientId}, reason: ${reason}`);

  // Record session duration
  metrics.sessionDurationHistogram?.record(durationMs / 1000, { reason });
  metrics.sessionsEndedCounter?.add(1, { reason });
  span?.setAttribute('session.duration_seconds', durationMs / 1000);

  // Kill ttyd process
  if (activeSession.ttydProcess) {
    try {
      activeSession.ttydProcess.kill('SIGTERM');
    } catch (err) {
      console.error('Error killing ttyd:', err.message);
    }
  }

  // Clear hard timeout
  if (activeSession.hardTimeout) {
    clearTimeout(activeSession.hardTimeout);
    activeSession.hardTimeout = null;
  }

  // Clean up session env file (contains sensitive credentials)
  if (activeSession.envFileCleanup) {
    activeSession.envFileCleanup();
  }

  // Clear session token
  clearSessionToken(activeSession.sessionToken);

  // Record invite usage if applicable
  if (activeSession.inviteToken) {
    await deps.recordInviteUsage(redis, activeSession, endedAt, reason, cfg.AUDIT_RETENTION_DAYS);
  }

  // Notify client to clear cookie
  const clientWs = findClientWs(clientId, st);
  if (clientWs) {
    clientWs.send(
      JSON.stringify({
        type: 'session_ended',
        reason: reason,
        clear_session_cookie: true,
      })
    );

    const client = st.clients.get(clientWs);
    if (client) {
      client.state = 'connected';
      client.sessionToken = null;
    }
  }

  // Clean up Redis
  await redis.del(`session:${clientId}`);

  // Run sandbox cleanup for all configured platforms
  runSandboxCleanup(deps);

  st.setActiveSession(null);
  span?.end();

  // Process next in queue
  processQueue();
}

module.exports = {
  createDefaultDeps,
  generateSessionToken,
  clearSessionToken,
  findClientWs,
  createSessionEnvFile,
  startSession,
  endSession,
};
