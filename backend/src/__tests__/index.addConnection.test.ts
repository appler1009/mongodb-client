import * as index from '../index';
import { ConnectionService } from '../services/ConnectionService';
import type { ConnectionConfig } from '../types';

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

// Mock ConnectionService class
jest.mock('../services/ConnectionService', () => {
  const mockAddConnection = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      addConnection: mockAddConnection,
    })),
    __esModule: true,
    mockAddConnection,
  };
});

// Access the mocked addConnection function
const { mockAddConnection } = jest.requireMock('../services/ConnectionService');

describe('addConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddConnection.mockReset();
  });

  it('adds a new connection successfully', async () => {
    const newConnection: ConnectionConfig = {
      id: '3',
      name: 'DevDB',
      uri: 'mongodb://dev:27017/dev',
    };
    mockAddConnection.mockResolvedValue(newConnection);

    const result = await index.addConnection(newConnection);

    expect(mockAddConnection).toHaveBeenCalledTimes(1);
    expect(mockAddConnection).toHaveBeenCalledWith(newConnection);
    expect(result).toEqual(newConnection);
    const mockLogger = require('pino')();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ id: newConnection.id, name: newConnection.name }),
      'IPC: New connection added'
    );
  });

  it('throws error when addConnection fails', async () => {
    const newConnection: ConnectionConfig = {
      id: '3',
      name: 'DevDB',
      uri: 'mongodb://dev:27017/dev',
    };
    const errorMessage = 'Failed to add connection';
    mockAddConnection.mockRejectedValue(new Error(errorMessage));

    await expect(index.addConnection(newConnection)).rejects.toThrow(
      `Failed to add connection: ${errorMessage}`
    );

    expect(mockAddConnection).toHaveBeenCalledTimes(1);
    expect(mockAddConnection).toHaveBeenCalledWith(newConnection);
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), body: newConnection }),
      'IPC: Failed to add new connection'
    );
  });
});
