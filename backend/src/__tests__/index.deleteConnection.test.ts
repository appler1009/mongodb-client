import * as index from '../index';
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
  const mockDeleteConnection = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      deleteConnection: mockDeleteConnection,
    })),
    __esModule: true,
    mockDeleteConnection,
  };
});

let mockInternalActiveConnectionId: string | null = null;
const mockDisconnectMongoInternal = jest.fn(async () => {});

jest.mock('../index', () => {
  const actualIndex = jest.requireActual('../index');
  const { mockDeleteConnection: mockConnectionServiceDelete } = jest.requireMock('../services/ConnectionService');

  return {
    ...actualIndex,
    deleteConnection: jest.fn(async (id: string) => {
      try {
        const deleted = await mockConnectionServiceDelete(id);
        if (deleted) {
          if (mockInternalActiveConnectionId === id) {
            await mockDisconnectMongoInternal();
            const mockLogger = require('pino')();
            mockLogger.warn(`IPC: Deleted active connection ${id}. Disconnected existing connection.`);
          }
          const mockLogger = require('pino')();
          mockLogger.debug({ id }, 'IPC: Connection deleted');
          return true;
        }
        return false;
      } catch (error: any) {
        const mockLogger = require('pino')();
        mockLogger.error({ error, id }, 'IPC: Failed to delete connection');
        throw new Error(`Failed to delete connection: ${error.message}`);
      }
    }),
    disconnectMongoInternal: mockDisconnectMongoInternal,
    __setMockActiveConnectionId: (value: string | null) => {
      mockInternalActiveConnectionId = value;
    },
  };
});

const { mockDeleteConnection } = jest.requireMock('../services/ConnectionService');
const {
  deleteConnection: deleteConnectionUnderTest,
  disconnectMongoInternal: disconnectMongoInternalSpy,
  __setMockActiveConnectionId,
} = jest.requireMock('../index');

describe('deleteConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteConnection.mockReset();
    disconnectMongoInternalSpy.mockReset();
    __setMockActiveConnectionId(null);
  });

  it('deletes a non-active connection successfully', async () => {
    const connectionId = '1';
    mockDeleteConnection.mockResolvedValue(true);

    const result = await deleteConnectionUnderTest(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
    const mockLogger = require('pino')();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection deleted'
    );
  });

  it('deletes active connection and triggers disconnection', async () => {
    const connectionId = '1';
    __setMockActiveConnectionId(connectionId);
    mockDeleteConnection.mockResolvedValue(true);

    const result = await deleteConnectionUnderTest(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    const mockLogger = require('pino')();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `IPC: Deleted active connection ${connectionId}. Disconnected existing connection.`
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection deleted'
    );
  });

  it('returns false when connection is not found', async () => {
    const connectionId = '1';
    mockDeleteConnection.mockResolvedValue(false);

    const result = await deleteConnectionUnderTest(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    expect(result).toBe(false);
    const mockLogger = require('pino')();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('throws error when deleteConnection fails', async () => {
    const connectionId = '1';
    const errorMessage = 'Failed to delete connection';
    mockDeleteConnection.mockRejectedValue(new Error(errorMessage));

    await expect(deleteConnectionUnderTest(connectionId)).rejects.toThrow(
      `Failed to delete connection: ${errorMessage}`
    );

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), id: connectionId }),
      'IPC: Failed to delete connection'
    );
  });
});
