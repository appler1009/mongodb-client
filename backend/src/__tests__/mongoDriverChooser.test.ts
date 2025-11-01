// src/__tests__/mongoDriverChooser.test.ts
import { connectWithDriverFallback, ConnectionAttemptResult, MongoClient } from '../services/mongoDriverChooser';

type MockMongoClient = jest.Mocked<MongoClient>;

const mockMongoClient = {
  close: jest.fn(),
} as unknown as MockMongoClient;

jest.mock('mongodb-wrapper-v6', () => {
  const mongoV6 = jest.requireActual('mongodb-wrapper-v6');
  return {
    ...mongoV6,
    MongoDBWrapperV6: jest.fn(),
  };
});

const { MongoDBWrapperV6 } = require('mongodb-wrapper-v6');
const mockConnect = jest.fn();
MongoDBWrapperV6.mockImplementation(() => ({
  connect: mockConnect,
}));

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

const mockLogger = jest.requireMock('pino')();

const mongoUri = "mongodb://user:pw@mongo1.local:27017,mongo2.local:27017/main?replicaSet=hello";

describe('mongoDriverChooser', () => {
  let result: ConnectionAttemptResult;

  afterEach(() => {
    if (result && result.client) {
      result.client.close();
    }
  });

  describe('connectWithDriverFallback', () => {
    it.only('should pick v6 driver if the connection can be established', async () => {
      mockConnect.mockReturnValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });
});
