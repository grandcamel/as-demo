/**
 * Secure session environment file management.
 *
 * Creates temporary .env files with restricted permissions (0600)
 * to pass sensitive credentials to spawned containers without
 * exposing them in process arguments or environment variables.
 */

const fs = require('fs');
const path = require('path');

/**
 * Create a secure session environment file.
 *
 * The file is created with mode 0600 (owner read/write only) to prevent
 * other users from reading sensitive credentials.
 *
 * @param {Object} options - Options
 * @param {string} options.sessionId - Unique session identifier
 * @param {string} options.containerPath - Path inside the queue manager container
 * @param {string} options.hostPath - Path on the Docker host (for volume mounts)
 * @param {Object} options.credentials - Key-value pairs to write to the file
 * @returns {Object} Created file info with cleanup function
 * @returns {string} result.containerPath - Full path to the env file in container
 * @returns {string} result.hostPath - Full path to the env file on host
 * @returns {Function} result.cleanup - Function to remove the env file
 *
 * @example
 * const envFile = createSessionEnvFile({
 *   sessionId: 'abc-123',
 *   containerPath: '/run/session-env',
 *   hostPath: '/tmp/session-env',
 *   credentials: {
 *     API_TOKEN: 'secret-token',
 *     API_EMAIL: 'user@example.com'
 *   }
 * });
 *
 * // Use envFile.hostPath with docker run --env-file
 * // ...
 *
 * // Clean up when done
 * envFile.cleanup();
 */
function createSessionEnvFile(options) {
  const {
    sessionId,
    containerPath,
    hostPath,
    credentials
  } = options;

  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }
  if (!containerPath || typeof containerPath !== 'string') {
    throw new Error('containerPath must be a non-empty string');
  }
  if (!hostPath || typeof hostPath !== 'string') {
    throw new Error('hostPath must be a non-empty string');
  }
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('credentials must be an object');
  }

  const filename = `session-${sessionId}.env`;
  const fullContainerPath = path.join(containerPath, filename);
  const fullHostPath = path.join(hostPath, filename);

  // Build env file content
  // Filter out empty/undefined values
  const envContent = Object.entries(credentials)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

  // Ensure directory exists
  try {
    fs.mkdirSync(containerPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw new Error(`Failed to create env directory: ${err.message}`);
    }
  }

  // Write file with secure permissions (0600 = owner read/write only)
  try {
    fs.writeFileSync(fullContainerPath, envContent, { mode: 0o600 });
  } catch (err) {
    throw new Error(`Failed to write env file: ${err.message}`);
  }

  // Create cleanup function
  const cleanup = () => {
    try {
      fs.unlinkSync(fullContainerPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Failed to cleanup env file ${fullContainerPath}: ${err.message}`);
      }
    }
  };

  return {
    containerPath: fullContainerPath,
    hostPath: fullHostPath,
    cleanup
  };
}

/**
 * Create an env file manager that tracks multiple session files.
 *
 * @param {Object} options - Manager options
 * @param {string} options.containerPath - Base path inside the queue manager container
 * @param {string} options.hostPath - Base path on the Docker host
 * @returns {Object} Env file manager
 *
 * @example
 * const manager = createEnvFileManager({
 *   containerPath: '/run/session-env',
 *   hostPath: '/tmp/session-env'
 * });
 *
 * const envFile = manager.create('session-123', {
 *   API_TOKEN: 'secret'
 * });
 *
 * // Later...
 * manager.cleanup('session-123');
 * // Or cleanup all:
 * manager.cleanupAll();
 */
function createEnvFileManager(options) {
  const { containerPath, hostPath } = options;

  if (!containerPath || !hostPath) {
    throw new Error('containerPath and hostPath are required');
  }

  // Track created env files: sessionId -> { containerPath, hostPath, cleanup }
  const files = new Map();

  /**
   * Create an env file for a session.
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} credentials - Credentials to write
   * @returns {Object} Env file info
   */
  function create(sessionId, credentials) {
    // Clean up existing file for this session if any
    if (files.has(sessionId)) {
      cleanup(sessionId);
    }

    const envFile = createSessionEnvFile({
      sessionId,
      containerPath,
      hostPath,
      credentials
    });

    files.set(sessionId, envFile);
    return envFile;
  }

  /**
   * Clean up env file for a session.
   *
   * @param {string} sessionId - Session identifier
   */
  function cleanup(sessionId) {
    const envFile = files.get(sessionId);
    if (envFile) {
      envFile.cleanup();
      files.delete(sessionId);
    }
  }

  /**
   * Clean up all tracked env files.
   */
  function cleanupAll() {
    for (const [sessionId] of files) {
      cleanup(sessionId);
    }
  }

  /**
   * Get env file info for a session.
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object|undefined} Env file info or undefined
   */
  function get(sessionId) {
    return files.get(sessionId);
  }

  /**
   * Get number of tracked env files.
   *
   * @returns {number} Number of tracked files
   */
  function size() {
    return files.size;
  }

  // Ensure directory exists on creation
  try {
    fs.mkdirSync(containerPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`Warning: Could not create env directory: ${err.message}`);
    }
  }

  return {
    create,
    cleanup,
    cleanupAll,
    get,
    size
  };
}

module.exports = {
  createSessionEnvFile,
  createEnvFileManager
};
