/**
 * Tests for config/metrics.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Create mock for createMetrics
const mockCreateMetrics = vi.fn(() => ({
  getTracer: vi.fn(() => 'mock-tracer'),
  sessionsStarted: 'mock-sessionsStarted',
  sessionsEnded: 'mock-sessionsEnded',
  sessionDuration: 'mock-sessionDuration',
  queueWait: 'mock-queueWait',
  ttydSpawn: 'mock-ttydSpawn',
  invitesValidated: 'mock-invitesValidated',
  sandboxCleanup: 'mock-sandboxCleanup',
}));

const mockCore = {
  createMetrics: mockCreateMetrics,
};

// Helper to get a fresh metrics module with the mock injected
function getFreshMetricsModule() {
  // Clear require cache for our module
  const metricsPath = require.resolve('../../config/metrics');
  const corePath = require.resolve('@demo-platform/queue-manager-core');
  delete require.cache[metricsPath];

  // Mock the core module
  require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: mockCore,
  };

  return require('../../config/metrics');
}

describe('metrics config', () => {
  let metrics;
  let createMetrics;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mock implementation
    mockCreateMetrics.mockImplementation(() => ({
      getTracer: vi.fn(() => 'mock-tracer'),
      sessionsStarted: 'mock-sessionsStarted',
      sessionsEnded: 'mock-sessionsEnded',
      sessionDuration: 'mock-sessionDuration',
      queueWait: 'mock-queueWait',
      ttydSpawn: 'mock-ttydSpawn',
      invitesValidated: 'mock-invitesValidated',
      sandboxCleanup: 'mock-sandboxCleanup',
    }));

    metrics = getFreshMetricsModule();
    createMetrics = require('@demo-platform/queue-manager-core').createMetrics;
  });

  describe('initMetrics', () => {
    it('should call createMetrics with correct options', () => {
      const getQueueLength = vi.fn(() => 5);
      const getActiveSessionCount = vi.fn(() => 1);

      metrics.initMetrics(getQueueLength, getActiveSessionCount);

      expect(createMetrics).toHaveBeenCalledWith({
        serviceName: 'as-demo-queue-manager',
        getQueueLength,
        getActiveSessionCount,
      });
    });
  });

  describe('getTracer', () => {
    it('should return null before initMetrics called', () => {
      const freshMetrics = getFreshMetricsModule();

      expect(freshMetrics.getTracer()).toBeNull();
    });

    it('should return tracer after initMetrics called', () => {
      metrics.initMetrics(vi.fn(), vi.fn());

      expect(metrics.getTracer()).toBe('mock-tracer');
    });
  });

  describe('metric getters', () => {
    beforeEach(() => {
      metrics.initMetrics(vi.fn(), vi.fn());
    });

    it('should expose sessionsStartedCounter', () => {
      expect(metrics.sessionsStartedCounter).toBe('mock-sessionsStarted');
    });

    it('should expose sessionsEndedCounter', () => {
      expect(metrics.sessionsEndedCounter).toBe('mock-sessionsEnded');
    });

    it('should expose sessionDurationHistogram', () => {
      expect(metrics.sessionDurationHistogram).toBe('mock-sessionDuration');
    });

    it('should expose queueWaitHistogram', () => {
      expect(metrics.queueWaitHistogram).toBe('mock-queueWait');
    });

    it('should expose ttydSpawnHistogram', () => {
      expect(metrics.ttydSpawnHistogram).toBe('mock-ttydSpawn');
    });

    it('should expose invitesValidatedCounter', () => {
      expect(metrics.invitesValidatedCounter).toBe('mock-invitesValidated');
    });

    it('should expose sandboxCleanupHistogram', () => {
      expect(metrics.sandboxCleanupHistogram).toBe('mock-sandboxCleanup');
    });
  });

  describe('metric getters before init', () => {
    it('should return undefined for metrics before init', () => {
      const freshMetrics = getFreshMetricsModule();

      expect(freshMetrics.sessionsStartedCounter).toBeUndefined();
      expect(freshMetrics.sessionsEndedCounter).toBeUndefined();
    });
  });
});
