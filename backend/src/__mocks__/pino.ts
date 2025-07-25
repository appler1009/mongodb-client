interface MockedPinoLogger {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  fatal: jest.Mock;
  child: jest.Mock<MockedPinoLogger, []>;
}

export const mockLoggerMethods: MockedPinoLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLoggerMethods),
};

export const mockLogger = mockLoggerMethods;

const mockPinoFactory = jest.fn(() => mockLoggerMethods);

module.exports = mockPinoFactory;

Object.defineProperty(module.exports, 'mockLogger', {
  value: mockLoggerMethods,
});
