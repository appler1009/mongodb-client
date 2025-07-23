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
  const mockGetConnections = jest.fn(); // Define mock inside factory
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      getConnections: mockGetConnections,
    })),
    __esModule: true, // Ensure ES module compatibility
    mockGetConnections, // Export for test access
  };
});

// Access the mocked getConnections function
const { mockGetConnections } = jest.requireMock('../services/ConnectionService');

describe('getConnections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnections.mockReset();
  });

  it('returns list of connections on success', async () => {
    const connections: ConnectionConfig[] = [
      { id: '1', name: 'TestDB', uri: 'mongodb://localhost:27017/test' },
      { id: '2', name: 'ProdDB', uri: 'mongodb://prod:27017/prod' },
    ];
    mockGetConnections.mockResolvedValue(connections);

    const result = await index.getConnections();

    expect(mockGetConnections).toHaveBeenCalledTimes(1);
    expect(result).toEqual(connections);
  });

  it('throws error when getConnections fails', async () => {
    const errorMessage = 'Failed to retrieve connections';
    mockGetConnections.mockRejectedValue(new Error(errorMessage));

    await expect(index.getConnections()).rejects.toThrow(
      `Failed to retrieve connections: ${errorMessage}`
    );

    expect(mockGetConnections).toHaveBeenCalledTimes(1);
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'IPC: Failed to get connections'
    );
  });
});
