/**
 * Tests for config/cross-platform.js
 *
 * Tests cross-platform scenario configuration and filtering.
 */

describe('cross-platform config', () => {
  let crossPlatform;

  beforeEach(() => {
    jest.resetModules();
    crossPlatform = require('../../config/cross-platform');
  });

  describe('SCENARIO_NAMES', () => {
    it('should define incident-response scenario', () => {
      const scenario = crossPlatform.SCENARIO_NAMES['incident-response'];

      expect(scenario).toBeDefined();
      expect(scenario.file).toBe('cross-platform/incident-response.md');
      expect(scenario.title).toBe('Incident Response');
      expect(scenario.requiredPlatforms).toEqual(['splunk', 'confluence', 'jira']);
    });

    it('should define sre-oncall scenario', () => {
      const scenario = crossPlatform.SCENARIO_NAMES['sre-oncall'];

      expect(scenario).toBeDefined();
      expect(scenario.requiredPlatforms).toEqual(['splunk', 'confluence', 'jira']);
    });

    it('should define change-management scenario', () => {
      const scenario = crossPlatform.SCENARIO_NAMES['change-management'];

      expect(scenario).toBeDefined();
      expect(scenario.requiredPlatforms).toEqual(['jira', 'confluence', 'splunk']);
    });

    it('should define knowledge-sync scenario', () => {
      const scenario = crossPlatform.SCENARIO_NAMES['knowledge-sync'];

      expect(scenario).toBeDefined();
      expect(scenario.requiredPlatforms).toEqual(['jira', 'confluence']);
    });

    it('should have icons for all scenarios', () => {
      for (const [key, scenario] of Object.entries(crossPlatform.SCENARIO_NAMES)) {
        expect(scenario.icon).toBeDefined();
        expect(scenario.icon.length).toBeGreaterThan(0);
      }
    });

    it('should have descriptions for all scenarios', () => {
      for (const [key, scenario] of Object.entries(crossPlatform.SCENARIO_NAMES)) {
        expect(scenario.description).toBeDefined();
        expect(scenario.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getAvailableScenarios', () => {
    it('should return all scenarios when all platforms enabled', () => {
      const available = crossPlatform.getAvailableScenarios(['confluence', 'jira', 'splunk']);

      expect(Object.keys(available)).toContain('incident-response');
      expect(Object.keys(available)).toContain('sre-oncall');
      expect(Object.keys(available)).toContain('change-management');
      expect(Object.keys(available)).toContain('knowledge-sync');
    });

    it('should return only knowledge-sync when only jira and confluence enabled', () => {
      const available = crossPlatform.getAvailableScenarios(['confluence', 'jira']);

      expect(Object.keys(available)).toEqual(['knowledge-sync']);
    });

    it('should return empty when only one platform enabled', () => {
      const available = crossPlatform.getAvailableScenarios(['confluence']);

      expect(Object.keys(available)).toEqual([]);
    });

    it('should return empty when no platforms enabled', () => {
      const available = crossPlatform.getAvailableScenarios([]);

      expect(Object.keys(available)).toEqual([]);
    });

    it('should handle splunk-only (no cross-platform scenarios require only splunk)', () => {
      const available = crossPlatform.getAvailableScenarios(['splunk']);

      expect(Object.keys(available)).toEqual([]);
    });

    it('should handle splunk and jira (no scenarios require only these two)', () => {
      const available = crossPlatform.getAvailableScenarios(['splunk', 'jira']);

      expect(Object.keys(available)).toEqual([]);
    });

    it('should handle splunk and confluence (no scenarios require only these two)', () => {
      const available = crossPlatform.getAvailableScenarios(['splunk', 'confluence']);

      expect(Object.keys(available)).toEqual([]);
    });

    it('should preserve scenario properties in returned object', () => {
      const available = crossPlatform.getAvailableScenarios(['confluence', 'jira', 'splunk']);
      const scenario = available['incident-response'];

      expect(scenario.file).toBe('cross-platform/incident-response.md');
      expect(scenario.title).toBe('Incident Response');
      expect(scenario.icon).toBeDefined();
      expect(scenario.description).toBeDefined();
      expect(scenario.requiredPlatforms).toBeDefined();
    });
  });

  describe('validateScenarios', () => {
    it('should not throw for valid scenarios', () => {
      expect(() => crossPlatform.validateScenarios()).not.toThrow();
    });

    it('should throw for invalid platform in scenario', () => {
      // Temporarily add invalid scenario
      const originalScenarios = { ...crossPlatform.SCENARIO_NAMES };
      crossPlatform.SCENARIO_NAMES['invalid-test'] = {
        file: 'test.md',
        title: 'Test',
        icon: '🧪',
        description: 'Test',
        requiredPlatforms: ['confluence', 'invalid-platform']
      };

      expect(() => crossPlatform.validateScenarios())
        .toThrow("Cross-platform scenario 'invalid-test' has invalid platform requirements: invalid-platform");

      // Restore
      delete crossPlatform.SCENARIO_NAMES['invalid-test'];
    });
  });
});
