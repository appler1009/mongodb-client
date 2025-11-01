// frontend/src/__tests__/jest.setup.js
const jestDom = require('@testing-library/jest-dom');
const React = require('react');

// Use fake timers to make async operations synchronous
jest.useFakeTimers();

// Suppress act() warnings in tests unless DEBUG_TESTS is set
const shouldSuppressWarnings = !process.env.DEBUG_TESTS;

if (shouldSuppressWarnings) {
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeAll(() => {
    console.error = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('An update to DatabaseBrowser inside a test was not wrapped in act')
      ) {
        return;
      }
      originalError.call(console, ...args);
    };

    console.warn = (...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('Warning: An update to DatabaseBrowser inside a test was not wrapped in act')
      ) {
        return;
      }
      originalWarn.call(console, ...args);
    };
  });

  afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });
}

// Mock the backend API
jest.mock('../api/backend', () => ({
  getDatabaseCollections: jest.fn(),
  getCollectionDocuments: jest.fn(),
}));

// Mock react-bootstrap components
jest.mock('react-bootstrap', () => ({
  Container: ({ children, ...props }) => React.createElement('div', { ...props, fluid: props.fluid ? 'true' : undefined }, children),
  Row: ({ children, ...props }) => React.createElement('div', props, children),
  Col: ({ children, ...props }) => React.createElement('div', props, children),
}));