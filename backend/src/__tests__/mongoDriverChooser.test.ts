// src/__tests__/mongoDriverChooser.test.ts
import { connectWithDriverFallback, ConnectionAttemptResult, MongoClient } from '../services/mongoDriverChooser';

type MockMongoClient = jest.Mocked<MongoClient>;

const mockMongoClient = {
  close: jest.fn(),
} as unknown as MockMongoClient;

// Mock all MongoDB wrapper versions
jest.mock('mongodb-wrapper-v6', () => {
  const mongoV6 = jest.requireActual('mongodb-wrapper-v6');
  return {
    ...mongoV6,
    MongoDBWrapperV6: jest.fn(),
  };
});

jest.mock('mongodb-wrapper-v5', () => {
  const mongoV5 = jest.requireActual('mongodb-wrapper-v5');
  return {
    ...mongoV5,
    MongoDBWrapperV5: jest.fn(),
  };
});

jest.mock('mongodb-wrapper-v4', () => {
  const mongoV4 = jest.requireActual('mongodb-wrapper-v4');
  return {
    ...mongoV4,
    MongoDBWrapperV4: jest.fn(),
  };
});

jest.mock('mongodb-wrapper-v3', () => {
  const mongoV3 = jest.requireActual('mongodb-wrapper-v3');
  return {
    ...mongoV3,
    MongoDBWrapperV3: jest.fn(),
  };
});

const { MongoDBWrapperV6 } = require('mongodb-wrapper-v6');
const { MongoDBWrapperV5 } = require('mongodb-wrapper-v5');
const { MongoDBWrapperV4 } = require('mongodb-wrapper-v4');
const { MongoDBWrapperV3 } = require('mongodb-wrapper-v3');

const mockConnectV6 = jest.fn();
const mockConnectV5 = jest.fn();
const mockConnectV4 = jest.fn();
const mockConnectV3 = jest.fn();

const mockDisconnectV6 = jest.fn();
const mockDisconnectV5 = jest.fn();
const mockDisconnectV4 = jest.fn();
const mockDisconnectV3 = jest.fn();

MongoDBWrapperV6.mockImplementation(() => ({
  connect: mockConnectV6,
  disconnect: mockDisconnectV6,
}));

MongoDBWrapperV5.mockImplementation(() => ({
  connect: mockConnectV5,
  disconnect: mockDisconnectV5,
}));

MongoDBWrapperV4.mockImplementation(() => ({
  connect: mockConnectV4,
  disconnect: mockDisconnectV4,
}));

MongoDBWrapperV3.mockImplementation(() => ({
  connect: mockConnectV3,
  disconnect: mockDisconnectV3,
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (result && result.client) {
      result.client.close();
    }
  });

  describe('connectWithDriverFallback', () => {
    it('should connect successfully with v6 driver when no knownVersion is provided', async () => {
      mockConnectV6.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger);
      expect(result.driverVersion).toBe('v6');
      expect(result.client).toBe(mockMongoClient);
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV6).toHaveBeenCalledWith();
      expect(mockLogger.info).toHaveBeenCalledWith(`Attempting to connect with mongodb-wrapper-v6... to ${mongoUri}`);
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully connected with mongodb-wrapper-v6.');
    });

    it('should fallback to v5 when v6 fails', async () => {
      mockConnectV6.mockRejectedValue(new Error('v6 connection failed'));
      mockConnectV5.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger);
      expect(result.driverVersion).toBe('v5');
      expect(result.client).toBe(mockMongoClient);
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockConnectV4).not.toHaveBeenCalled();
      expect(mockConnectV3).not.toHaveBeenCalled();
      expect(mockDisconnectV6).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Connection failed with mongodb-wrapper-v6: v6 connection failed');
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully connected with mongodb-wrapper-v5.');
    });

    it('should fallback to v4 when v6 and v5 fail', async () => {
      mockConnectV6.mockRejectedValue(new Error('v6 failed'));
      mockConnectV5.mockRejectedValue(new Error('v5 failed'));
      mockConnectV4.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger);
      expect(result.driverVersion).toBe('v4');
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockConnectV4).toHaveBeenCalledTimes(1);
      expect(mockConnectV3).not.toHaveBeenCalled();
      expect(mockDisconnectV6).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV5).toHaveBeenCalledTimes(1);
    });

    it('should fallback to v3 when v6, v5, and v4 fail', async () => {
      mockConnectV6.mockRejectedValue(new Error('v6 failed'));
      mockConnectV5.mockRejectedValue(new Error('v5 failed'));
      mockConnectV4.mockRejectedValue(new Error('v4 failed'));
      mockConnectV3.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger);
      expect(result.driverVersion).toBe('v3');
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockConnectV4).toHaveBeenCalledTimes(1);
      expect(mockConnectV3).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV6).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV5).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV4).toHaveBeenCalledTimes(1);
    });

    it('should throw error when all versions fail', async () => {
      mockConnectV6.mockRejectedValue(new Error('v6 failed'));
      mockConnectV5.mockRejectedValue(new Error('v5 failed'));
      mockConnectV4.mockRejectedValue(new Error('v4 failed'));
      mockConnectV3.mockRejectedValue(new Error('v3 failed'));
      await expect(connectWithDriverFallback(mongoUri, mockLogger)).rejects.toThrow(
        'Failed to connect to MongoDB with any available driver version (v6, v5, v4, v3). Please check your MongoDB server\'s version and accessibility.'
      );
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockConnectV4).toHaveBeenCalledTimes(1);
      expect(mockConnectV3).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV6).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV5).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV4).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV3).toHaveBeenCalledTimes(1);
    });

    it('should connect with knownVersion v6 successfully', async () => {
      mockConnectV6.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v6');
      expect(result.driverVersion).toBe('v6');
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(`Connecting with mongodb-wrapper-v6... to ${mongoUri}`);
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully connected with mongodb-wrapper-v6.');
    });

    it('should connect with knownVersion v5 successfully', async () => {
      mockConnectV5.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v5');
      expect(result.driverVersion).toBe('v5');
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockConnectV6).not.toHaveBeenCalled();
    });

    it('should connect with knownVersion v4 successfully', async () => {
      mockConnectV4.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v4');
      expect(result.driverVersion).toBe('v4');
      expect(mockConnectV4).toHaveBeenCalledTimes(1);
      expect(mockConnectV6).not.toHaveBeenCalled();
    });

    it('should connect with knownVersion v3 successfully', async () => {
      mockConnectV3.mockResolvedValue(mockMongoClient);
      result = await connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v3');
      expect(result.driverVersion).toBe('v3');
      expect(mockConnectV3).toHaveBeenCalledTimes(1);
      expect(mockConnectV6).not.toHaveBeenCalled();
    });

    it('should throw error when knownVersion v6 fails', async () => {
      mockConnectV6.mockRejectedValue(new Error('v6 failed'));
      await expect(connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v6')).rejects.toThrow(
        'Failed to connect with known version v6: v6 failed'
      );
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockDisconnectV6).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid knownVersion', async () => {
      await expect(connectWithDriverFallback(mongoUri, mockLogger, undefined, 'v7' as any)).rejects.toThrow(
        "Invalid knownVersion 'v7'. Must be 'v6', 'v5', 'v4', or 'v3'."
      );
      expect(mockConnectV6).not.toHaveBeenCalled();
    });

    it('should throw AbortError if signal is aborted before connection attempt', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(connectWithDriverFallback(mongoUri, mockLogger, undefined, undefined, controller.signal)).rejects.toThrow(
        'Connection attempt aborted'
      );
      expect(mockConnectV6).not.toHaveBeenCalled();
    });

    it('should throw AbortError if signal is aborted during connection attempt', async () => {
      const controller = new AbortController();
      mockConnectV6.mockImplementation(() => {
        controller.abort();
        throw new Error('Connection aborted');
      });
      await expect(connectWithDriverFallback(mongoUri, mockLogger, undefined, undefined, controller.signal)).rejects.toThrow(
        'Connection attempt aborted'
      );
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
    });

    it('should handle abortion after failure', async () => {
      const controller = new AbortController();
      mockConnectV6.mockRejectedValue(new Error('v6 failed'));
      mockConnectV5.mockImplementation(() => {
        controller.abort();
        return Promise.reject(new Error('Aborted'));
      });
      await expect(connectWithDriverFallback(mongoUri, mockLogger, undefined, undefined, controller.signal)).rejects.toThrow(
        'Connection attempt aborted'
      );
      expect(mockConnectV6).toHaveBeenCalledTimes(1);
      expect(mockConnectV5).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Connection attempt with v5 aborted.');
    });
  });
});
