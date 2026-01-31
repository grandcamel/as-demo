/**
 * Tests for routes/scenarios.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Helper function to set up mocks for scenarios module
function setupScenariosModule(options = {}) {
  const {
    readFileSyncFn = vi.fn(
      () =>
        '<!DOCTYPE html><html><head><title>{{TITLE}}</title></head><body>{{ICON}} {{PLATFORM}}: {{CONTENT}}</body></html>'
    ),
    readFileFn = vi.fn(),
    markedFn = vi.fn((md) => `<p>${md}</p>`),
    sanitizeFn = vi.fn((html) => html),
    scenarioNames = {
      page: {
        file: 'confluence/page.md',
        title: 'Page Management',
        icon: '📝',
        platform: 'confluence',
      },
      malicious: {
        file: '../../../etc/passwd',
        title: 'Malicious',
        icon: '💀',
        platform: 'attack',
      },
    },
    getScenariosByPlatformFn = vi.fn(() => ({
      confluence: { page: { title: 'Page Management' } },
    })),
  } = options;

  // Clear require cache
  const paths = ['../../routes/scenarios', '../../config', 'fs', 'marked', 'isomorphic-dompurify']
    .map((p) => {
      try {
        return require.resolve(p);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  paths.forEach((p) => delete require.cache[p]);

  // Mock fs
  const fsPath = require.resolve('fs');
  const fsMock = {
    readFileSync: readFileSyncFn,
    readFile: readFileFn,
  };
  require.cache[fsPath] = {
    id: fsPath,
    filename: fsPath,
    loaded: true,
    exports: fsMock,
  };

  // Mock marked
  const markedPath = require.resolve('marked');
  require.cache[markedPath] = {
    id: markedPath,
    filename: markedPath,
    loaded: true,
    exports: { marked: markedFn },
  };

  // Mock isomorphic-dompurify
  const dompurifyPath = require.resolve('isomorphic-dompurify');
  require.cache[dompurifyPath] = {
    id: dompurifyPath,
    filename: dompurifyPath,
    loaded: true,
    exports: { sanitize: sanitizeFn },
  };

  // Mock config
  const configPath = require.resolve('../../config');
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      SCENARIOS_PATH: '/opt/demo-container/scenarios',
      SCENARIO_NAMES: scenarioNames,
      getScenariosByPlatform: getScenariosByPlatformFn,
    },
  };

  return {
    fs: fsMock,
    config: require('../../config'),
    scenarios: require('../../routes/scenarios'),
  };
}

describe('scenarios routes', () => {
  let scenarios;
  let mockApp;
  let registeredRoutes;
  let config;
  let fs;

  beforeEach(() => {
    vi.clearAllMocks();

    const mocks = setupScenariosModule();
    fs = mocks.fs;
    config = mocks.config;
    scenarios = mocks.scenarios;

    registeredRoutes = {};
    mockApp = {
      get: vi.fn((path, handler) => {
        registeredRoutes[path] = handler;
      }),
    };

    scenarios.register(mockApp);
  });

  describe('register', () => {
    it('should register /api/scenarios/:name route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/scenarios/:name', expect.any(Function));
    });

    it('should register /api/scenarios route', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/api/scenarios', expect.any(Function));
    });
  });

  describe('GET /api/scenarios/:name', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/scenarios/:name'];
      mockReq = {
        params: { name: 'page' },
      };
      mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        send: vi.fn(),
      };
    });

    it('should return 404 for unknown scenario', () => {
      mockReq.params.name = 'nonexistent';

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Scenario not found' });
    });

    it('should render scenario HTML for valid scenario', () => {
      fs.readFile.mockImplementation((path, encoding, callback) => {
        callback(null, '# Test Markdown Content');
      });

      handler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should escape HTML in title and icon', () => {
      fs.readFile.mockImplementation((path, encoding, callback) => {
        callback(null, '# Content');
      });

      handler(mockReq, mockRes);

      const sentHtml = mockRes.send.mock.calls[0][0];
      expect(sentHtml).toContain('📝'); // icon
      expect(sentHtml).toContain('Page Management'); // title
    });

    it('should return 404 when file not found', () => {
      fs.readFile.mockImplementation((path, encoding, callback) => {
        callback(new Error('ENOENT: file not found'));
      });

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Scenario file not found' });
    });

    it('should block path traversal attempts', () => {
      mockReq.params.name = 'malicious';

      handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid path' });
    });
  });

  describe('GET /api/scenarios', () => {
    let handler;
    let mockReq;
    let mockRes;

    beforeEach(() => {
      handler = registeredRoutes['/api/scenarios'];
      mockReq = {};
      mockRes = {
        json: vi.fn(),
      };
    });

    it('should return scenarios grouped by platform', () => {
      handler(mockReq, mockRes);

      expect(config.getScenariosByPlatform).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        confluence: { page: { title: 'Page Management' } },
      });
    });
  });

  describe('template loading', () => {
    it('should use fallback template when file not found', () => {
      // Set up mocks with readFileSync that throws
      const mocks = setupScenariosModule({
        readFileSyncFn: vi.fn(() => {
          throw new Error('ENOENT');
        }),
        readFileFn: vi.fn((path, encoding, callback) => {
          callback(null, 'Content');
        }),
        scenarioNames: {
          page: {
            file: 'confluence/page.md',
            title: 'Page Management',
            icon: '📝',
            platform: 'confluence',
          },
        },
        getScenariosByPlatformFn: vi.fn(),
      });

      const localRoutes = {};
      const freshApp = {
        get: vi.fn((path, handler) => {
          localRoutes[path] = handler;
        }),
      };
      mocks.scenarios.register(freshApp);

      const handler = localRoutes['/api/scenarios/:name'];
      const mockReq = { params: { name: 'page' } };
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        send: vi.fn(),
      };

      handler(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalled();
      const html = mockRes.send.mock.calls[0][0];
      // Fallback template is simple - should contain body and content
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<body>');
      expect(html).toContain('Content'); // The markdown content was rendered
    });
  });

  describe('escapeHtml', () => {
    it('should escape XSS in scenario metadata', () => {
      // Set up mocks with XSS-containing scenario
      const mocks = setupScenariosModule({
        readFileSyncFn: vi.fn(() => '{{TITLE}} {{ICON}}'),
        readFileFn: vi.fn((path, encoding, callback) => {
          callback(null, 'Safe content');
        }),
        scenarioNames: {
          xss: {
            file: 'test.md',
            title: '<script>alert("xss")</script>',
            icon: '<img onerror="alert(1)">',
            platform: 'test',
          },
        },
        getScenariosByPlatformFn: vi.fn(),
      });

      const localRoutes = {};
      const freshApp = {
        get: vi.fn((path, handler) => {
          localRoutes[path] = handler;
        }),
      };
      mocks.scenarios.register(freshApp);

      const handler = localRoutes['/api/scenarios/:name'];
      const mockReq = { params: { name: 'xss' } };
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        send: vi.fn(),
      };

      handler(mockReq, mockRes);

      const html = mockRes.send.mock.calls[0][0];
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
