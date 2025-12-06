import { DatabaseService } from '../services/DatabaseService';
import { prepareDocumentForFrontend } from '../utils/documentPreparation';
import pino from 'pino';

jest.mock('pino');
let mockLogger: jest.Mocked<pino.Logger>;

import { getCollectionDocuments } from '../index';

let mockIsDbActive: jest.Mock;
let mockGetDocuments: jest.Mock;
let mockGetDocumentCount: jest.Mock;
let mockSetActiveDb: jest.Mock;
let mockGetCollections: jest.Mock;
let mockGetAllDocuments: jest.Mock;
let mockGetCollectionSchemaAndSampleDocuments: jest.Mock;

jest.mock('../services/DatabaseService', () => {
  const internalMockIsDbActive = jest.fn();
  const internalMockGetDocuments = jest.fn();
  const internalMockGetDocumentCount = jest.fn();
  const internalMockSetActiveDb = jest.fn();
  const internalMockGetCollections = jest.fn();
  const internalMockGetAllDocuments = jest.fn();
  const internalMockGetCollectionSchemaAndSampleDocuments = jest.fn();

  const MockDatabaseService = jest.fn().mockImplementation(() => {
    return {
      isDbActive: internalMockIsDbActive,
      getDocuments: internalMockGetDocuments,
      getDocumentCount: internalMockGetDocumentCount,
      setActiveDb: internalMockSetActiveDb,
      getCollections: internalMockGetCollections,
      getAllDocuments: internalMockGetAllDocuments,
      getCollectionSchemaAndSampleDocuments: internalMockGetCollectionSchemaAndSampleDocuments,
      activeDb: null,
      connectionService: {} as any,
    };
  });

  return {
    __esModule: true,
    DatabaseService: MockDatabaseService,
    isDbActive: internalMockIsDbActive,
    getDocuments: internalMockGetDocuments,
    getDocumentCount: internalMockGetDocumentCount,
    setActiveDb: internalMockSetActiveDb,
    getCollections: internalMockGetCollections,
    getAllDocuments: internalMockGetAllDocuments,
    getCollectionSchemaAndSampleDocuments: internalMockGetCollectionSchemaAndSampleDocuments,
  };
});


describe('getCollectionDocuments', () => {
  const defaultCollectionName = 'testCollection';
  const defaultLimit = 20;
  const defaultSkip = 0;
  const defaultParams = {};

  beforeAll(() => {
    const pinoModule = jest.mocked(pino);
    mockLogger = pinoModule() as jest.Mocked<pino.Logger>;

    const mockedDbService = jest.requireMock('../services/DatabaseService');
    mockIsDbActive = mockedDbService.isDbActive;
    mockGetDocuments = mockedDbService.getDocuments;
    mockGetDocumentCount = mockedDbService.getDocumentCount;
    mockSetActiveDb = mockedDbService.setActiveDb;
    mockGetCollections = mockedDbService.getCollections;
    mockGetAllDocuments = mockedDbService.getAllDocuments;
    mockGetCollectionSchemaAndSampleDocuments = mockedDbService.getCollectionSchemaAndSampleDocuments;
  });

  beforeEach(() => {
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    mockIsDbActive.mockClear().mockReturnValue(true);
    mockGetDocuments.mockClear().mockResolvedValue([]);
    mockGetDocumentCount.mockClear().mockResolvedValue(0);
    mockSetActiveDb.mockClear();
    mockGetCollections.mockClear();
    mockGetAllDocuments.mockClear();
    mockGetCollectionSchemaAndSampleDocuments.mockClear();
  });

  it('should return documents and total count when successful', async () => {
    const rawDocuments = [{ _id: '1', name: 'Doc1' }, { _id: '2', name: 'Doc2' }];
    const transformedDocuments = rawDocuments.map(prepareDocumentForFrontend);
    const totalCount = 100;

    mockGetDocuments.mockResolvedValue(rawDocuments);
    mockGetDocumentCount.mockResolvedValue(totalCount);

    const result = await getCollectionDocuments(defaultCollectionName);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(defaultCollectionName, defaultLimit, defaultSkip, defaultParams, undefined);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(defaultCollectionName, defaultParams, undefined);
    expect(result.documents).toEqual(transformedDocuments);
    expect(result.totalDocuments).toBe(totalCount);
  });

  it('should apply limit, skip, and params correctly', async () => {
    const collectionName = 'anotherCollection';
    const limit = 5;
    const skip = 10;
    const params: any = { filter: '{"status":"active"}' };

    const rawDocuments = [{ _id: '3', name: 'Doc3' }];
    const transformedDocuments = rawDocuments.map(prepareDocumentForFrontend);
    const totalCount = 50;

    mockGetDocuments.mockResolvedValue(rawDocuments);
    mockGetDocumentCount.mockResolvedValue(totalCount);

    const result = await getCollectionDocuments(collectionName, limit, skip, params);

    expect(mockGetDocuments).toHaveBeenCalledWith(collectionName, limit, skip, params, undefined);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(collectionName, params, undefined);
    expect(result.documents).toEqual(transformedDocuments);
    expect(result.totalDocuments).toBe(totalCount);
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);

    await expect(getCollectionDocuments(defaultCollectionName)).rejects.toThrow(
      'No active database connection to retrieve documents.'
    );
    // Updated expectation to match the actual log message and arguments
    expect(mockLogger.error).toHaveBeenCalledWith(
      { collectionName: defaultCollectionName, error: new Error('No active database connection to retrieve documents.') },
      'IPC: Failed to get documents from collection'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getDocuments gracefully', async () => {
    const error = new Error('DB read error');
    mockGetDocuments.mockRejectedValue(error);

    await expect(getCollectionDocuments(defaultCollectionName)).rejects.toThrow(
      `Failed to retrieve documents from collection ${defaultCollectionName}: ${error.message}`
    );
    // Updated expectation to match the actual log message
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: error, collectionName: defaultCollectionName },
      'IPC: Failed to get documents from collection'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
  });

  it('should handle errors from databaseService.getDocumentCount gracefully', async () => {
    const error = new Error('Count error');
    mockGetDocuments.mockResolvedValueOnce([{ _id: '1' }]);
    mockGetDocumentCount.mockRejectedValue(error);

    await expect(getCollectionDocuments(defaultCollectionName)).rejects.toThrow(
      `Failed to retrieve documents from collection ${defaultCollectionName}: ${error.message}`
    );
    // Updated expectation to match the actual log message
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: error, collectionName: defaultCollectionName },
      'IPC: Failed to get documents from collection'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledTimes(1);
  });

  it('should return empty documents array and zero count for an empty collection', async () => {
    mockGetDocuments.mockResolvedValue([]);
    mockGetDocumentCount.mockResolvedValue(0);

    const result = await getCollectionDocuments(defaultCollectionName);

    expect(result.documents).toEqual([]);
    expect(result.totalDocuments).toBe(0);
    expect(mockGetDocuments).toHaveBeenCalledWith(defaultCollectionName, defaultLimit, defaultSkip, defaultParams, undefined);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(defaultCollectionName, defaultParams, undefined);
  });

  it('prepareDocumentForFrontend should return non-object/non-array inputs as is', () => {
    expect(prepareDocumentForFrontend(null)).toBeNull();
    expect(prepareDocumentForFrontend(undefined)).toBeUndefined();
    expect(prepareDocumentForFrontend('string')).toBe('string');
    expect(prepareDocumentForFrontend(123)).toBe(123);
    expect(prepareDocumentForFrontend(true)).toBe(true);
  });

  it('prepareDocumentForFrontend should convert ObjectId to string', () => {
    const mockObjectId = {
      _bsontype: 'ObjectID',
      toHexString: () => '60d5ec49c1b7a6001c9c7e7a',
    };
    const doc = { _id: mockObjectId, name: 'Test Doc' };
    const expected = { _id: '60d5ec49c1b7a6001c9c7e7a', name: 'Test Doc' };
    expect(prepareDocumentForFrontend(doc)).toEqual(expected);
  });

  it('prepareDocumentForFrontend should convert Date objects to ISO string', () => {
    const date = new Date('2023-01-01T12:00:00.000Z');
    const doc = { timestamp: date, event: 'Login' };
    const expected = { timestamp: '2023-01-01T12:00:00.000Z', event: 'Login' };
    expect(prepareDocumentForFrontend(doc)).toEqual(expected);
  });

  it('prepareDocumentForFrontend should recursively process nested objects and arrays', () => {
    const nestedDate = new Date('2024-02-15T10:30:00.000Z');
    const mockNestedObjectId = {
      _bsontype: 'ObjectID',
      toHexString: () => '60d5ec49c1b7a6001c9c7e7b',
    };
    const doc = {
      user: {
        _id: mockNestedObjectId,
        joined: nestedDate,
        roles: ['admin', 'editor'],
      },
      log: [{ message: 'Entry 1', time: nestedDate }],
    };
    const expected = {
      user: {
        _id: '60d5ec49c1b7a6001c9c7e7b',
        joined: '2024-02-15T10:30:00.000Z',
        roles: ['admin', 'editor'],
      },
      log: [{ message: 'Entry 1', time: '2024-02-15T10:30:00.000Z' }],
    };
    expect(prepareDocumentForFrontend(doc)).toEqual(expected);
  });
});
