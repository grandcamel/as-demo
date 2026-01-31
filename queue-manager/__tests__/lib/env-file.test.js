/**
 * Tests for lib/env-file.js
 *
 * Tests environment file management with fs mocking.
 *
 * Note: Since the source file uses CommonJS require('fs'), we need to
 * use vi.mock with the proper structure and hoist the mock functions
 * so they can be referenced within the mock factory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

// Create CommonJS require for importing the module under test
const require = createRequire(import.meta.url);

// Create mock functions
const mockFs = {
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn()
};

describe('env-file', () => {
  let createSessionEnvFile;
  let createEnvFileManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});

    // Clear require cache to get fresh module state
    const modulePath = require.resolve('../../lib/env-file');
    const fsPath = require.resolve('fs');

    // Delete cached modules
    delete require.cache[modulePath];

    // Replace fs in require.cache with our mock
    require.cache[fsPath] = {
      id: fsPath,
      filename: fsPath,
      loaded: true,
      exports: mockFs
    };

    // Now require the module - it will use our mocked fs
    const envFileModule = require('../../lib/env-file');
    createSessionEnvFile = envFileModule.createSessionEnvFile;
    createEnvFileManager = envFileModule.createEnvFileManager;
  });

  describe('createSessionEnvFile', () => {
    const validOptions = {
      sessionId: 'session-123',
      containerPath: '/run/session-env',
      hostPath: '/tmp/session-env',
      credentials: {
        API_TOKEN: 'secret-token',
        API_EMAIL: 'user@example.com'
      }
    };

    describe('validation', () => {
      it('should throw error for empty sessionId', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          sessionId: ''
        })).toThrow('sessionId must be a non-empty string');
      });

      it('should throw error for null sessionId', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          sessionId: null
        })).toThrow('sessionId must be a non-empty string');
      });

      it('should throw error for non-string sessionId', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          sessionId: 12345
        })).toThrow('sessionId must be a non-empty string');
      });

      it('should throw error for empty containerPath', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          containerPath: ''
        })).toThrow('containerPath must be a non-empty string');
      });

      it('should throw error for null containerPath', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          containerPath: null
        })).toThrow('containerPath must be a non-empty string');
      });

      it('should throw error for empty hostPath', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          hostPath: ''
        })).toThrow('hostPath must be a non-empty string');
      });

      it('should throw error for null hostPath', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          hostPath: null
        })).toThrow('hostPath must be a non-empty string');
      });

      it('should throw error for null credentials', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          credentials: null
        })).toThrow('credentials must be an object');
      });

      it('should throw error for non-object credentials', () => {
        expect(() => createSessionEnvFile({
          ...validOptions,
          credentials: 'string'
        })).toThrow('credentials must be an object');
      });
    });

    describe('directory creation', () => {
      it('should create directory with recursive option', () => {
        createSessionEnvFile(validOptions);

        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          validOptions.containerPath,
          { recursive: true }
        );
      });

      it('should ignore EEXIST error', () => {
        const error = new Error('Directory exists');
        error.code = 'EEXIST';
        mockFs.mkdirSync.mockImplementation(() => { throw error; });

        expect(() => createSessionEnvFile(validOptions)).not.toThrow();
      });

      it('should throw other mkdir errors', () => {
        const error = new Error('Permission denied');
        error.code = 'EACCES';
        mockFs.mkdirSync.mockImplementation(() => { throw error; });

        expect(() => createSessionEnvFile(validOptions))
          .toThrow('Failed to create env directory: Permission denied');
      });
    });

    describe('file writing', () => {
      it('should write file with correct path', () => {
        createSessionEnvFile(validOptions);

        const expectedPath = path.join(
          validOptions.containerPath,
          `session-${validOptions.sessionId}.env`
        );

        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expectedPath,
          expect.any(String),
          { mode: 0o600 }
        );
      });

      it('should write credentials as KEY=value format', () => {
        createSessionEnvFile(validOptions);

        const writtenContent = mockFs.writeFileSync.mock.calls[0][1];

        expect(writtenContent).toContain('API_TOKEN=secret-token');
        expect(writtenContent).toContain('API_EMAIL=user@example.com');
        expect(writtenContent).toMatch(/\n$/); // Ends with newline
      });

      it('should filter out empty values', () => {
        createSessionEnvFile({
          ...validOptions,
          credentials: {
            KEEP: 'value',
            EMPTY: '',
            NULL: null,
            UNDEFINED: undefined
          }
        });

        const writtenContent = mockFs.writeFileSync.mock.calls[0][1];

        expect(writtenContent).toContain('KEEP=value');
        expect(writtenContent).not.toContain('EMPTY=');
        expect(writtenContent).not.toContain('NULL=');
        expect(writtenContent).not.toContain('UNDEFINED=');
      });

      it('should set file mode to 0600', () => {
        createSessionEnvFile(validOptions);

        const options = mockFs.writeFileSync.mock.calls[0][2];

        expect(options.mode).toBe(0o600);
      });

      it('should throw on write error', () => {
        mockFs.writeFileSync.mockImplementation(() => {
          throw new Error('Disk full');
        });

        expect(() => createSessionEnvFile(validOptions))
          .toThrow('Failed to write env file: Disk full');
      });
    });

    describe('return value', () => {
      it('should return containerPath with filename', () => {
        const result = createSessionEnvFile(validOptions);

        expect(result.containerPath).toBe(
          path.join(validOptions.containerPath, 'session-session-123.env')
        );
      });

      it('should return hostPath with filename', () => {
        const result = createSessionEnvFile(validOptions);

        expect(result.hostPath).toBe(
          path.join(validOptions.hostPath, 'session-session-123.env')
        );
      });

      it('should return cleanup function', () => {
        const result = createSessionEnvFile(validOptions);

        expect(typeof result.cleanup).toBe('function');
      });
    });

    describe('cleanup function', () => {
      it('should delete the created file', () => {
        const result = createSessionEnvFile(validOptions);

        result.cleanup();

        expect(mockFs.unlinkSync).toHaveBeenCalledWith(result.containerPath);
      });

      it('should ignore ENOENT error (file already deleted)', () => {
        const result = createSessionEnvFile(validOptions);

        const error = new Error('File not found');
        error.code = 'ENOENT';
        mockFs.unlinkSync.mockImplementation(() => { throw error; });

        expect(() => result.cleanup()).not.toThrow();
      });

      it('should log other unlink errors', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = createSessionEnvFile(validOptions);

        const error = new Error('Permission denied');
        error.code = 'EACCES';
        mockFs.unlinkSync.mockImplementation(() => { throw error; });

        result.cleanup();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to cleanup env file')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('edge cases', () => {
      it('should handle empty credentials object', () => {
        const result = createSessionEnvFile({
          ...validOptions,
          credentials: {}
        });

        const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
        expect(writtenContent).toBe('\n');
        expect(result.containerPath).toBeDefined();
      });

      it('should handle credentials with special characters', () => {
        createSessionEnvFile({
          ...validOptions,
          credentials: {
            TOKEN: 'value=with=equals',
            COMPLEX: 'has spaces and $pecial'
          }
        });

        const writtenContent = mockFs.writeFileSync.mock.calls[0][1];

        expect(writtenContent).toContain('TOKEN=value=with=equals');
        expect(writtenContent).toContain('COMPLEX=has spaces and $pecial');
      });
    });
  });

  describe('createEnvFileManager', () => {
    const validManagerOptions = {
      containerPath: '/run/session-env',
      hostPath: '/tmp/session-env'
    };

    describe('validation', () => {
      it('should throw error for missing containerPath', () => {
        expect(() => createEnvFileManager({ hostPath: '/tmp' }))
          .toThrow('containerPath and hostPath are required');
      });

      it('should throw error for missing hostPath', () => {
        expect(() => createEnvFileManager({ containerPath: '/run' }))
          .toThrow('containerPath and hostPath are required');
      });

      it('should throw error for empty paths', () => {
        expect(() => createEnvFileManager({ containerPath: '', hostPath: '' }))
          .toThrow('containerPath and hostPath are required');
      });
    });

    describe('initialization', () => {
      it('should create directory on initialization', () => {
        createEnvFileManager(validManagerOptions);

        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          validManagerOptions.containerPath,
          { recursive: true }
        );
      });

      it('should log warning on mkdir error (non-EEXIST)', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const error = new Error('Permission denied');
        error.code = 'EACCES';
        mockFs.mkdirSync.mockImplementation(() => { throw error; });

        createEnvFileManager(validManagerOptions);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Warning: Could not create env directory')
        );

        consoleSpy.mockRestore();
      });

      it('should return manager object with all methods', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(manager).toHaveProperty('create');
        expect(manager).toHaveProperty('cleanup');
        expect(manager).toHaveProperty('cleanupAll');
        expect(manager).toHaveProperty('get');
        expect(manager).toHaveProperty('size');
      });
    });

    describe('create', () => {
      it('should create env file for session', () => {
        const manager = createEnvFileManager(validManagerOptions);
        mockFs.mkdirSync.mockClear();

        const envFile = manager.create('session-123', { TOKEN: 'secret' });

        expect(envFile.containerPath).toContain('session-session-123.env');
        expect(envFile.hostPath).toContain('session-session-123.env');
      });

      it('should track created files', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(manager.size()).toBe(0);

        manager.create('session-1', { TOKEN: 'a' });
        expect(manager.size()).toBe(1);

        manager.create('session-2', { TOKEN: 'b' });
        expect(manager.size()).toBe(2);
      });

      it('should cleanup existing file before creating new one', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('session-123', { TOKEN: 'old' });
        manager.create('session-123', { TOKEN: 'new' });

        // unlink should be called for the old file
        expect(mockFs.unlinkSync).toHaveBeenCalled();
        expect(manager.size()).toBe(1);
      });
    });

    describe('cleanup', () => {
      it('should cleanup specific session file', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('session-1', { TOKEN: 'a' });
        manager.create('session-2', { TOKEN: 'b' });

        manager.cleanup('session-1');

        expect(manager.size()).toBe(1);
        expect(manager.get('session-1')).toBeUndefined();
        expect(manager.get('session-2')).toBeDefined();
      });

      it('should handle cleanup of non-existent session', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(() => manager.cleanup('non-existent')).not.toThrow();
      });
    });

    describe('cleanupAll', () => {
      it('should cleanup all tracked files', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('session-1', { TOKEN: 'a' });
        manager.create('session-2', { TOKEN: 'b' });
        manager.create('session-3', { TOKEN: 'c' });

        manager.cleanupAll();

        expect(manager.size()).toBe(0);
        expect(mockFs.unlinkSync).toHaveBeenCalledTimes(3);
      });

      it('should handle empty manager', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(() => manager.cleanupAll()).not.toThrow();
        expect(manager.size()).toBe(0);
      });
    });

    describe('get', () => {
      it('should return env file info for existing session', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('session-123', { TOKEN: 'secret' });

        const envFile = manager.get('session-123');

        expect(envFile).toBeDefined();
        expect(envFile.containerPath).toContain('session-session-123.env');
      });

      it('should return undefined for non-existent session', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(manager.get('non-existent')).toBeUndefined();
      });
    });

    describe('size', () => {
      it('should return 0 for empty manager', () => {
        const manager = createEnvFileManager(validManagerOptions);

        expect(manager.size()).toBe(0);
      });

      it('should return correct count', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('s1', {});
        manager.create('s2', {});
        manager.create('s3', {});

        expect(manager.size()).toBe(3);
      });

      it('should update after cleanup', () => {
        const manager = createEnvFileManager(validManagerOptions);

        manager.create('s1', {});
        manager.create('s2', {});

        expect(manager.size()).toBe(2);

        manager.cleanup('s1');

        expect(manager.size()).toBe(1);
      });
    });
  });
});
