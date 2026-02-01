/**
 * Mock WebSocket client for unit tests.
 *
 * Provides a mock implementation of WebSocket connections
 * used by the queue manager handlers.
 */

const { EventEmitter } = require('events');

class MockWebSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    this.readyState = MockWebSocket.OPEN;
    this.messages = [];
    this.closed = false;
    this.closeCode = null;
    this.closeReason = null;
    this.id = options.id || `mock-ws-${Date.now()}`;
    this.upgradeReq = options.upgradeReq || {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  /**
   * Send a message.
   * @param {string|Buffer} data - Message data
   */
  send(data) {
    if (this.closed) {
      throw new Error('WebSocket is closed');
    }
    this.messages.push({
      data,
      timestamp: Date.now(),
      parsed: typeof data === 'string' ? JSON.parse(data) : null,
    });
  }

  /**
   * Close the connection.
   * @param {number} [code] - Close code
   * @param {string} [reason] - Close reason
   */
  close(code, reason) {
    if (!this.closed) {
      this.closed = true;
      this.closeCode = code;
      this.closeReason = reason;
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', code, reason);
    }
  }

  /**
   * Simulate receiving a message.
   * @param {string|Object} data - Message data
   */
  receive(data) {
    const message = typeof data === 'object' ? JSON.stringify(data) : data;
    this.emit('message', message);
  }

  /**
   * Simulate an error.
   * @param {Error} error - Error object
   */
  error(error) {
    this.emit('error', error);
  }

  /**
   * Get all sent messages.
   * @returns {Array} Array of sent messages
   */
  getSentMessages() {
    return this.messages;
  }

  /**
   * Get the last sent message.
   * @returns {Object|null} Last message or null
   */
  getLastMessage() {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  /**
   * Get messages of a specific type.
   * @param {string} type - Message type
   * @returns {Array} Matching messages
   */
  getMessagesByType(type) {
    return this.messages.filter((m) => m.parsed && m.parsed.type === type);
  }

  /**
   * Clear sent messages.
   */
  clearMessages() {
    this.messages = [];
  }

  /**
   * Check if a specific message type was sent.
   * @param {string} type - Message type to check
   * @returns {boolean}
   */
  hasSentType(type) {
    return this.messages.some((m) => m.parsed && m.parsed.type === type);
  }
}

// WebSocket ready states
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

/**
 * Create a mock WebSocket instance.
 * @param {Object} [options] - Options
 * @returns {MockWebSocket}
 */
function createMockWsClient(options = {}) {
  return new MockWebSocket(options);
}

/**
 * Create a mock WebSocket with typical client headers.
 * @param {Object} [overrides] - Header overrides
 * @returns {MockWebSocket}
 */
function createMockWsClientWithHeaders(overrides = {}) {
  return new MockWebSocket({
    upgradeReq: {
      headers: {
        'user-agent': 'Mozilla/5.0 Test Client',
        'x-forwarded-for': '192.168.1.100',
        origin: 'https://demo.example.com',
        ...overrides,
      },
      socket: { remoteAddress: '127.0.0.1' },
    },
  });
}

module.exports = {
  MockWebSocket,
  createMockWsClient,
  createMockWsClientWithHeaders,
};
