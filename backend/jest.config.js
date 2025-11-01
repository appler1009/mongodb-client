// backend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|js)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }]
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '/packages/mongodb-wrapper-v6/dist/',
    '/packages/mongodb-wrapper-v5/dist/',
    '/packages/mongodb-wrapper-v4/dist/',
    '/packages/mongodb-wrapper-v3/dist/',
    '/dist/__mocks__/',
  ],
  coverageReporters: ['lcov', 'text', 'json'],
  coverageDirectory: '../coverage/backend',
  moduleDirectories: ['node_modules', '<rootDir>/../packages'],
  moduleNameMapper: {
    '^mongodb-wrapper-v6$': '<rootDir>/../packages/mongodb-wrapper-v6',
    '^mongodb-wrapper-v5$': '<rootDir>/../packages/mongodb-wrapper-v5',
    '^mongodb-wrapper-v4$': '<rootDir>/../packages/mongodb-wrapper-v4',
    '^mongodb-wrapper-v3$': '<rootDir>/../packages/mongodb-wrapper-v3',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.js']
};
