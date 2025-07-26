import * as index from '../index';
import { DatabaseService } from '../services/DatabaseService';
import pino from 'pino';
import type { MongoQueryParams } from '../types';

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
  const mockGetDocumentCount = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getDocumentCount: mockGetDocumentCount,
    })),
    __esModule: true,
    mockIsDbActive,
    mockGetDocumentCount,
  };
});

const { mockIsDbActive, mockGetDocumentCount } = jest.requireMock('../services/DatabaseService');
const mockLogger = jest.requireMock('pino')();

describe('getCollectionDocumentCounts', () => {
  const collectionName = 'testCollection';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockIsDbActive.mockClear();
    mockGetDocumentCount.mockClear();

    // Default mocks
    mockIsDbActive.mockReturnValue(true);
    mockGetDocumentCount.mockResolvedValue(42);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully fetch document count for collection', async () => {
    const result = await index.getCollectionDocumentCounts(collectionName);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      { collectionName, count: 42 },
      'Backend: Fetched document count for collection'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(collectionName);
    expect(result).toBe(42);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedError = new Error('No active database connection to get document counts.');

    await expect(index.getCollectionDocumentCounts(collectionName)).rejects.toThrow(
      expectedError.message
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), collectionName }),
      'Backend: Failed to fetch document count for collection'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getDocumentCount and re-throw', async () => {
    const serviceError = new Error('Failed to fetch count');
    mockGetDocumentCount.mockRejectedValue(serviceError);

    await expect(index.getCollectionDocumentCounts(collectionName)).rejects.toThrow(
      `Failed to fetch document count for collection ${collectionName}: ${serviceError.message}`
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(collectionName);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: serviceError, collectionName }),
      'Backend: Failed to fetch document count for collection'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
