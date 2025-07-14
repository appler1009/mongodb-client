// backend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|js)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }]
  },
  coverageReporters: ['lcov', 'text'],
  coverageDirectory: 'coverage',
  moduleDirectories: ['node_modules', '<rootDir>/../packages'],
  moduleNameMapper: {
    '^mongodb-wrapper-v6$': '<rootDir>/../packages/mongodb-wrapper-v6',
    '^mongodb-wrapper-v5$': '<rootDir>/../packages/mongodb-wrapper-v5',
    '^mongodb-wrapper-v4$': '<rootDir>/../packages/mongodb-wrapper-v4',
    '^mongodb-wrapper-v3$': '<rootDir>/../packages/mongodb-wrapper-v3'
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.js']
};
