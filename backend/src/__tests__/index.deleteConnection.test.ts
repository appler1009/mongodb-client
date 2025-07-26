import * as index from '../index';
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
  const mockDeleteConnection = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      deleteConnection: mockDeleteConnection,
    })),
    __esModule: true,
    mockDeleteConnection,
  };
});

jest.mock('../utils/disconnectMongo', () => ({
  disconnectMongo: jest.fn(async () => undefined),
}));

const { mockDeleteConnection } = jest.requireMock('../services/ConnectionService');
const mockLogger = jest.requireMock('pino')();

describe('deleteConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteConnection.mockReset();
    index.setActiveConnectionId(undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('deletes a non-active connection successfully', async () => {
    const connectionId = '1';
    mockDeleteConnection.mockResolvedValue(true);

    const result = await index.deleteConnection(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongo).not.toHaveBeenCalled();
    expect(result).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectionId }),
      'IPC: Connection deleted'
    );
  });

  it('deletes active connection and triggers disconnection', async () => {
    const connectionId = '1';
    index.setActiveConnectionId(connectionId);
    mockDeleteConnection.mockResolvedValue(true);

    const result = await index.deleteConnection(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongo).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
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

    const result = await index.deleteConnection(connectionId);

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongo).not.toHaveBeenCalled();
    expect(result).toBe(false);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('throws error when deleteConnection fails', async () => {
    const connectionId = '1';
    const errorMessage = 'Failed to delete connection';
    mockDeleteConnection.mockRejectedValue(new Error(errorMessage));

    await expect(index.deleteConnection(connectionId)).rejects.toThrow(
      `Failed to delete connection: ${errorMessage}`
    );

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    expect(mockDeleteConnection).toHaveBeenCalledWith(connectionId);
    expect(disconnectMongo).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), id: connectionId }),
      'IPC: Failed to delete connection'
    );
  });
});
