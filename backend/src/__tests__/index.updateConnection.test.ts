import * as actualIndex from '../index';
import { ConnectionService } from '../services/ConnectionService';
import type { ConnectionConfig } from '../types';

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
    })),
    __esModule: true,
    mockUpdateConnection,
  };
});

let mockActiveConnectionId: string | null = null;
const mockMongoClientClose = jest.fn().mockResolvedValue(undefined);

const mockedDisconnectMongoInternal = jest.fn(async () => {
  if (mockActiveConnectionId) {
    await mockMongoClientClose();
    mockActiveConnectionId = null;
  }
});

jest.mock('../index', () => {
  const { mockUpdateConnection: mockConnectionServiceUpdate } = jest.requireMock('../services/ConnectionService');

  return {
    updateConnection: jest.fn(async (id: string, updatedConnection: ConnectionConfig) => {
      try {
        const result = await mockConnectionServiceUpdate(id, updatedConnection);

        if (result) {
          if (mockActiveConnectionId === id) {
            await mockedDisconnectMongoInternal();
            const mockLogger = require('pino')();
            mockLogger.warn(`IPC: Updated active connection ${id}. Disconnected existing connection.`);
          }
          const mockLogger = require('pino')();
          mockLogger.debug({ id }, 'IPC: Connection updated');
          return result;
        }
        return null;
      } catch (error: any) {
        const mockLogger = require('pino')();
        mockLogger.error({ error, id, body: updatedConnection }, 'IPC: Failed to update connection');
        throw new Error(`Failed to update connection: ${error.message}`);
      }
    }),
    disconnectMongoInternal: mockedDisconnectMongoInternal,
    get activeConnectionId() {
      return mockActiveConnectionId;
    },
    set activeConnectionId(value: string | null) {
      mockActiveConnectionId = value;
    },
    __setMockActiveConnectionId: (value: string | null) => {
      mockActiveConnectionId = value;
    },
    __getMockMongoClientClose: () => mockMongoClientClose,
  };
});

const { mockUpdateConnection } = jest.requireMock('../services/ConnectionService');
const {
  __setMockActiveConnectionId,
  __getMockMongoClientClose,
  disconnectMongoInternal: actualMockedDisconnectMongoInternal,
  updateConnection: mockedIndexUpdateConnection,
} = jest.requireMock('../index');

describe('updateConnection', () => {
  let localMockedDisconnectMongoInternal: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateConnection.mockReset();
    localMockedDisconnectMongoInternal = actualMockedDisconnectMongoInternal.mockReset();
    __setMockActiveConnectionId(null);
  });

  it('updates a non-active connection successfully', async () => {
    const connectionId = '1';
    const updatedConnection: ConnectionConfig = {
      id: connectionId,
      name: 'UpdatedDB',
      uri: 'mongodb://updated:27017/test',
    };
    mockUpdateConnection.mockResolvedValue(updatedConnection);

    const result = await mockedIndexUpdateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(localMockedDisconnectMongoInternal).not.toHaveBeenCalled();
    expect(result).toEqual(updatedConnection);
    const mockLogger = require('pino')();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection updated'
    );
  });

  it('updates active connection and triggers disconnection', async () => {
    const connectionId = '1';
    const updatedConnection: ConnectionConfig = {
      id: connectionId,
      name: 'UpdatedDB',
      uri: 'mongodb://updated:27017/test',
    };
    __setMockActiveConnectionId(connectionId);
    mockUpdateConnection.mockResolvedValue(updatedConnection);

    const result = await mockedIndexUpdateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(localMockedDisconnectMongoInternal).toHaveBeenCalledTimes(1);
    expect(result).toEqual(updatedConnection);
    const mockLogger = require('pino')();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `IPC: Updated active connection ${connectionId}. Disconnected existing connection.`
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection updated'
    );
  });

  it('returns null when connection is not found', async () => {
    const connectionId = '1';
    const updatedConnection: ConnectionConfig = {
      id: connectionId,
      name: 'UpdatedDB',
      uri: 'mongodb://updated:27017/test',
    };
    mockUpdateConnection.mockResolvedValue(null);

    const result = await mockedIndexUpdateConnection(connectionId, updatedConnection);

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(localMockedDisconnectMongoInternal).not.toHaveBeenCalled();
    expect(result).toBeNull();
    const mockLogger = require('pino')();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('throws error when updateConnection fails', async () => {
    const connectionId = '1';
    const updatedConnection: ConnectionConfig = {
      id: connectionId,
      name: 'UpdatedDB',
      uri: 'mongodb://updated:27017/test',
    };
    const errorMessage = 'Failed to update connection';
    mockUpdateConnection.mockRejectedValue(new Error(errorMessage));

    await expect(mockedIndexUpdateConnection(connectionId, updatedConnection)).rejects.toThrow(
      `Failed to update connection: ${errorMessage}`
    );

    expect(mockUpdateConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(connectionId, updatedConnection);
    expect(localMockedDisconnectMongoInternal).not.toHaveBeenCalled();
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), id: connectionId, body: updatedConnection }),
      'IPC: Failed to update connection'
    );
  });
});
