/**
 * Tests for config/metrics.js
 */

jest.mock('@demo-platform/queue-manager-core', () => ({
  createMetrics: jest.fn(() => ({
    getTracer: jest.fn(() => 'mock-tracer'),
    sessionsStarted: 'mock-sessionsStarted',
    sessionsEnded: 'mock-sessionsEnded',
    sessionDuration: 'mock-sessionDuration',
    queueWait: 'mock-queueWait',
    ttydSpawn: 'mock-ttydSpawn',
    invitesValidated: 'mock-invitesValidated',
    sandboxCleanup: 'mock-sandboxCleanup'
  }))
}));

describe('metrics config', () => {
  let metrics;
  let createMetrics;

  beforeEach(() => {
    jest.resetModules();
    createMetrics = require('@demo-platform/queue-manager-core').createMetrics;
    metrics = require('../../config/metrics');
  });

  describe('initMetrics', () => {
    it('should call createMetrics with correct options', () => {
      const getQueueLength = jest.fn(() => 5);
      const getActiveSessionCount = jest.fn(() => 1);

      metrics.initMetrics(getQueueLength, getActiveSessionCount);

      expect(createMetrics).toHaveBeenCalledWith({
        serviceName: 'as-demo-queue-manager',
        getQueueLength,
        getActiveSessionCount
      });
    });
  });

  describe('getTracer', () => {
    it('should return null before initMetrics called', () => {
      jest.resetModules();
      const freshMetrics = require('../../config/metrics');

      expect(freshMetrics.getTracer()).toBeNull();
    });

    it('should return tracer after initMetrics called', () => {
      metrics.initMetrics(jest.fn(), jest.fn());

      expect(metrics.getTracer()).toBe('mock-tracer');
    });
  });

  describe('metric getters', () => {
    beforeEach(() => {
      metrics.initMetrics(jest.fn(), jest.fn());
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
      jest.resetModules();
      const freshMetrics = require('../../config/metrics');

      expect(freshMetrics.sessionsStartedCounter).toBeUndefined();
      expect(freshMetrics.sessionsEndedCounter).toBeUndefined();
    });
  });
});
