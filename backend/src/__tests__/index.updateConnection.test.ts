import * as index from '../index';
import { ConnectionService } from '../services/ConnectionService';
import type { ConnectionConfig } from '../types';
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
  const mockUpdateConnection = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      updateConnection: mockUpdateConnection,
      databaseService: { setActiveDb: jest.fn() }, // Mock databaseService for disconnectMongo
    })),
    __esModule: true,
    mockUpdateConnection,
  };
});

jest.mock('../utils/disconnectMongo', () => ({
  disconnectMongo: jest.fn(async () => undefined),
}));

const { mockUpdateConnection } = jest.requireMock('../services/ConnectionService');
const mockLogger = jest.requireMock('pino')();
const disconnectMongoSpy = disconnectMongo as jest.Mock;

describe('updateConnection', () => {
  const connectionId = '1';
  const updatedConnection: ConnectionConfig = {
    id: connectionId,
    name: 'UpdatedDB',
    uri: 'mongodb://updated:27017/test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateConnection.mockReset();
    disconnectMongoSpy.mockReset();
    index.setActiveConnectionId(undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('updates a non-active connection successfully', async () => {
    mockUpdateConnection.mockResolvedValue(updatedConnection);

    const result = await index.updateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(disconnectMongoSpy).not.toHaveBeenCalled();
    expect(result).toEqual(updatedConnection);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection updated'
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('updates active connection and triggers disconnection', async () => {
    index.setActiveConnectionId(connectionId);
    mockUpdateConnection.mockResolvedValue(updatedConnection);

    const result = await index.updateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(disconnectMongoSpy).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
    expect(result).toEqual(updatedConnection);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `IPC: Updated active connection ${connectionId}. Disconnected existing connection.`
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection updated'
    );
  });

  it('returns null when connection is not found', async () => {
    mockUpdateConnection.mockResolvedValue(null);

    const result = await index.updateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(disconnectMongoSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('throws error when updateConnection fails', async () => {
    const errorMessage = 'Failed to update connection';
    mockUpdateConnection.mockRejectedValue(new Error(errorMessage));

    await expect(index.updateConnection(connectionId, updatedConnection)).rejects.toThrow(
      `Failed to update connection: ${errorMessage}`
    );

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(disconnectMongoSpy).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), id: connectionId, body: updatedConnection }),
      'IPC: Failed to update connection'
    );
  });
});
