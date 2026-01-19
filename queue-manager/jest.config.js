module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/'
  ],
  coverageThreshold: {
    './lib/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  verbose: true
};
