import * as index from '../index';
import { DatabaseService } from '../services/DatabaseService';
import pino from 'pino';
import type { CollectionInfo } from '../types';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('../services/DatabaseService', () => {
  const mockIsDbActive = jest.fn();
  const mockGetCollections = jest.fn();
  const mockSetActiveDb = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getCollections: mockGetCollections,
      setActiveDb: mockSetActiveDb,
    })),
    __esModule: true,
    mockIsDbActive,
    mockGetCollections,
    mockSetActiveDb,
  };
});

const { mockIsDbActive, mockGetCollections, mockSetActiveDb } = jest.requireMock('../services/DatabaseService');
const mockLogger = jest.requireMock('pino')();

describe('getDatabaseCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockIsDbActive.mockClear();
    mockGetCollections.mockClear();
    mockSetActiveDb.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully retrieve collections when database is active', async () => {
    const mockCollections: CollectionInfo[] = [
      { name: 'col1', documentCount: 10 },
      { name: 'col2', documentCount: 20 },
    ];
    mockIsDbActive.mockReturnValue(true);
    mockGetCollections.mockResolvedValue(mockCollections);

    const result = await index.getDatabaseCollections();

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockCollections);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedError = new Error('No active database connection to list collections.');

    await expect(index.getDatabaseCollections()).rejects.toThrow(expectedError.message);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'IPC: Failed to get collections from active database'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getCollections and re-throw', async () => {
    mockIsDbActive.mockReturnValue(true);
    const serviceError = new Error('Failed to fetch collections from DB');
    mockGetCollections.mockRejectedValue(serviceError);

    await expect(index.getDatabaseCollections()).rejects.toThrow(
      `Failed to retrieve collections: ${serviceError.message}`
    );

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: serviceError }),
      'IPC: Failed to get collections from active database'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
  });
});
