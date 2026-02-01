/**
 * Session Lifecycle Hooks
 *
 * Provides a hook system for extending session behavior.
 * Plugins can register handlers for various lifecycle events.
 *
 * Events:
 * - 'before-session-start': Called before a session starts
 * - 'after-session-start': Called after a session has started
 * - 'before-session-end': Called before a session ends
 * - 'after-session-end': Called after a session has ended
 * - 'queue-joined': Called when a client joins the queue
 * - 'queue-left': Called when a client leaves the queue
 */

/**
 * @typedef {Object} HookContext
 * @property {string} clientId - Client identifier
 * @property {string} [sessionId] - Session identifier (if applicable)
 * @property {Object} [session] - Full session object (if applicable)
 * @property {Object} [client] - Client object
 * @property {string} [reason] - Reason for event (e.g., 'timeout', 'disconnect')
 * @property {Date} timestamp - Event timestamp
 */

/**
 * @callback HookHandler
 * @param {HookContext} context - Hook context
 * @returns {Promise<void>|void}
 */

const VALID_EVENTS = [
  'before-session-start',
  'after-session-start',
  'before-session-end',
  'after-session-end',
  'queue-joined',
  'queue-left',
];

class SessionHooks {
  constructor() {
    /** @type {Map<string, HookHandler[]>} */
    this.handlers = new Map();

    // Initialize empty arrays for all valid events
    for (const event of VALID_EVENTS) {
      this.handlers.set(event, []);
    }
  }

  /**
   * Register a hook handler.
   * @param {string} event - Event name
   * @param {HookHandler} handler - Handler function
   * @param {Object} [options] - Registration options
   * @param {string} [options.name] - Handler name for debugging
   * @param {number} [options.priority=0] - Execution priority (higher runs first)
   * @returns {function(): void} Unregister function
   */
  register(event, handler, options = {}) {
    if (!VALID_EVENTS.includes(event)) {
      throw new Error(`Invalid hook event: ${event}. Valid events: ${VALID_EVENTS.join(', ')}`);
    }

    if (typeof handler !== 'function') {
      throw new Error('Hook handler must be a function');
    }

    const wrappedHandler = {
      fn: handler,
      name: options.name || handler.name || 'anonymous',
      priority: options.priority || 0,
    };

    const handlers = this.handlers.get(event);
    handlers.push(wrappedHandler);

    // Sort by priority (higher first)
    handlers.sort((a, b) => b.priority - a.priority);

    // Return unregister function
    return () => {
      const index = handlers.indexOf(wrappedHandler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * Execute all handlers for an event.
   * @param {string} event - Event name
   * @param {HookContext} context - Hook context
   * @returns {Promise<{success: boolean, errors: Error[]}>}
   */
  async emit(event, context) {
    if (!VALID_EVENTS.includes(event)) {
      return { success: false, errors: [new Error(`Invalid hook event: ${event}`)] };
    }

    const handlers = this.handlers.get(event);
    const errors = [];

    for (const handler of handlers) {
      try {
        await handler.fn(context);
      } catch (error) {
        console.error(`Hook handler '${handler.name}' for '${event}' failed:`, error.message);
        errors.push(error);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Get list of registered handlers for an event.
   * @param {string} event - Event name
   * @returns {string[]} Handler names
   */
  getHandlers(event) {
    if (!VALID_EVENTS.includes(event)) {
      return [];
    }

    return this.handlers.get(event).map((h) => h.name);
  }

  /**
   * Get all registered events with handler counts.
   * @returns {Object} Map of event name to handler count
   */
  getStats() {
    const stats = {};
    for (const [event, handlers] of this.handlers.entries()) {
      stats[event] = handlers.length;
    }
    return stats;
  }

  /**
   * Clear all handlers for an event (or all events).
   * @param {string} [event] - Event name (if not specified, clears all)
   */
  clear(event) {
    if (event) {
      if (this.handlers.has(event)) {
        this.handlers.set(event, []);
      }
    } else {
      for (const evt of VALID_EVENTS) {
        this.handlers.set(evt, []);
      }
    }
  }
}

// Export singleton instance
const hooks = new SessionHooks();

module.exports = hooks;
module.exports.SessionHooks = SessionHooks;
module.exports.VALID_EVENTS = VALID_EVENTS;

/**
 * Helper to create hook context.
 * @param {Object} params - Context parameters
 * @returns {HookContext}
 */
module.exports.createHookContext = function createHookContext(params) {
  return {
    clientId: params.clientId,
    sessionId: params.sessionId,
    session: params.session,
    client: params.client,
    reason: params.reason,
    timestamp: params.timestamp || new Date(),
    ...params.extra,
  };
};
