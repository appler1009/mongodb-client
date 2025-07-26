import * as index from '../index';
import { ConnectionService } from '../services/ConnectionService';
import type { ConnectionStatus } from '../types';
import { disconnectMongo } from '../utils/disconnectMongo';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('../services/ConnectionService', () => {
  const mockUpdateConnectionStatus = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      updateConnectionStatus: mockUpdateConnectionStatus,
      databaseService: { setActiveDb: jest.fn() }, // Mock databaseService for disconnectMongo
    })),
    __esModule: true,
    mockUpdateConnectionStatus,
  };
});

jest.mock('../utils/disconnectMongo', () => {
  const disconnectMongoSpy = jest.fn(async () => {
    console.log('disconnectMongoSpy called');
    return undefined;
  });
  return {
    disconnectMongo: disconnectMongoSpy,
  };
});

const { mockUpdateConnectionStatus } = jest.requireMock('../services/ConnectionService');
const mockLogger = jest.requireMock('pino')();
const disconnectMongoSpy = disconnectMongo as jest.Mock;

describe('disconnectFromMongo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disconnectMongoSpy.mockReset();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('successfully disconnects from MongoDB', async () => {
    disconnectMongoSpy.mockResolvedValue(undefined);

    const result = await index.disconnectFromMongo();

    expect(disconnectMongoSpy).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: Successfully disconnected from MongoDB.');
    expect(result).toEqual({ message: 'Successfully disconnected from MongoDB.' });
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
  });

  it('handles errors during disconnection', async () => {
    const errorMessage = 'Failed to disconnect';
    disconnectMongoSpy.mockRejectedValue(new Error(errorMessage));

    await expect(index.disconnectFromMongo()).rejects.toThrow(
      `Failed to disconnect from MongoDB: ${errorMessage}`
    );

    expect(disconnectMongoSpy).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'IPC: Failed to disconnect from MongoDB'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
  });
});
