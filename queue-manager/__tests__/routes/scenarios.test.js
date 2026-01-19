/**
 * Tests for routes/scenarios.js
 */

const path = require('path');

describe('scenarios routes', () => {
  let scenarios;
  let mockApp;
  let registeredRoutes;
  let config;
  let fs;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set up mocks before requiring modules
    jest.doMock('fs', () => ({
      readFileSync: jest.fn(() => '<!DOCTYPE html><html><head><title>{{TITLE}}</title></head><body>{{ICON}} {{PLATFORM}}: {{CONTENT}}</body></html>'),
      readFile: jest.fn()
    }));

    jest.doMock('marked', () => ({
      marked: jest.fn((md) => `<p>${md}</p>`)
    }));

    jest.doMock('isomorphic-dompurify', () => ({
      sanitize: jest.fn((html) => html)
    }));

    jest.doMock('../../config', () => ({
      SCENARIOS_PATH: '/opt/demo-container/scenarios',
      SCENARIO_NAMES: {
        'page': {
          file: 'confluence/page.md',
          title: 'Page Management',
          icon: '📝',
          platform: 'confluence'
        },
        'malicious': {
          file: '../../../etc/passwd',
          title: 'Malicious',
          icon: '💀',
          platform: 'attack'
        }
      },
      getScenariosByPlatform: jest.fn(() => ({
        confluence: { page: { title: 'Page Management' } }
      }))
    }));

    fs = require('fs');
    config = require('../../config');
    scenarios = require('../../routes/scenarios');

    registeredRoutes = {};
    mockApp = {
      get: jest.fn((path, handler) => {
        registeredRoutes[path] = handler;
      })
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
        params: { name: 'page' }
      };
      mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn()
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
        json: jest.fn()
      };
    });

    it('should return scenarios grouped by platform', () => {
      handler(mockReq, mockRes);

      expect(config.getScenariosByPlatform).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        confluence: { page: { title: 'Page Management' } }
      });
    });
  });

  describe('template loading', () => {
    it('should use fallback template when file not found', () => {
      jest.resetModules();

      // Set up mocks for this specific test
      jest.doMock('fs', () => ({
        readFileSync: jest.fn(() => {
          throw new Error('ENOENT');
        }),
        readFile: jest.fn((path, encoding, callback) => {
          callback(null, 'Content');
        })
      }));

      jest.doMock('marked', () => ({
        marked: jest.fn((md) => `<p>${md}</p>`)
      }));

      jest.doMock('isomorphic-dompurify', () => ({
        sanitize: jest.fn((html) => html)
      }));

      jest.doMock('../../config', () => ({
        SCENARIOS_PATH: '/opt/demo-container/scenarios',
        SCENARIO_NAMES: {
          'page': {
            file: 'confluence/page.md',
            title: 'Page Management',
            icon: '📝',
            platform: 'confluence'
          }
        },
        getScenariosByPlatform: jest.fn()
      }));

      const freshScenarios = require('../../routes/scenarios');
      const localRoutes = {};
      const freshApp = {
        get: jest.fn((path, handler) => {
          localRoutes[path] = handler;
        })
      };
      freshScenarios.register(freshApp);

      const handler = localRoutes['/api/scenarios/:name'];
      const mockReq = { params: { name: 'page' } };
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn()
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
      jest.resetModules();

      // Set up mocks for this specific test
      jest.doMock('fs', () => ({
        readFileSync: jest.fn(() => '{{TITLE}} {{ICON}}'),
        readFile: jest.fn((path, encoding, callback) => {
          callback(null, 'Safe content');
        })
      }));

      jest.doMock('marked', () => ({
        marked: jest.fn((md) => `<p>${md}</p>`)
      }));

      jest.doMock('isomorphic-dompurify', () => ({
        sanitize: jest.fn((html) => html)
      }));

      jest.doMock('../../config', () => ({
        SCENARIOS_PATH: '/opt/demo-container/scenarios',
        SCENARIO_NAMES: {
          'xss': {
            file: 'test.md',
            title: '<script>alert("xss")</script>',
            icon: '<img onerror="alert(1)">',
            platform: 'test'
          }
        },
        getScenariosByPlatform: jest.fn()
      }));

      const freshScenarios = require('../../routes/scenarios');
      const localRoutes = {};
      const freshApp = {
        get: jest.fn((path, handler) => {
          localRoutes[path] = handler;
        })
      };
      freshScenarios.register(freshApp);

      const handler = localRoutes['/api/scenarios/:name'];
      const mockReq = { params: { name: 'xss' } };
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn()
      };

      handler(mockReq, mockRes);

      const html = mockRes.send.mock.calls[0][0];
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
