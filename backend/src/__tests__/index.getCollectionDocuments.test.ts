import { DatabaseService } from '../services/DatabaseService';
import { prepareDocumentForFrontend } from '../utils/documentPreparation';
import pino from 'pino';
jest.mock('pino');
let mockLogger: jest.Mocked<pino.Logger>;

const mockIsDbActive = jest.fn();
const mockGetDocuments = jest.fn();
const mockGetDocumentCount = jest.fn();
const mockSetActiveDb = jest.fn();
const mockGetCollections = jest.fn();
const mockGetAllDocuments = jest.fn();
const mockGetCollectionSchemaAndSampleDocuments = jest.fn();

let mockDatabaseServiceInstance: jest.Mocked<DatabaseService>;
let getCollectionDocuments: typeof import('../index').getCollectionDocuments;

jest.mock('../services/DatabaseService', () => {
  const MockDatabaseService = jest.fn().mockImplementation(() => {
    return {
      isDbActive: mockIsDbActive,
      getDocuments: mockGetDocuments,
      getDocumentCount: mockGetDocumentCount,
      setActiveDb: mockSetActiveDb,
      getCollections: mockGetCollections,
      getAllDocuments: mockGetAllDocuments,
      getCollectionSchemaAndSampleDocuments: mockGetCollectionSchemaAndSampleDocuments,
      activeDb: null,
      connectionService: {} as any,
    };
  });
  return { DatabaseService: MockDatabaseService };
});


jest.mock('../index', () => {
  const actualModule = jest.requireActual('../index');
  const internalPinoFactory = jest.requireMock('pino') as jest.MockedFunction<typeof pino>;
  const internalMockLogger = internalPinoFactory() as jest.Mocked<pino.Logger>;

  return {
    ...actualModule,
    getCollectionDocuments: jest.fn(async (
      collectionName: string,
      limit: number = 20,
      skip: number = 0,
      params: any = {},
    ) => {
      internalMockLogger.debug('IPC: getCollectionDocuments called');
      try {
        const { DatabaseService } = require('../services/DatabaseService');
        const dbServiceInstance = new DatabaseService(internalMockLogger);

        if (!dbServiceInstance.isDbActive()) {
          internalMockLogger.error('No active database connection for getting collection documents.');
          throw new Error('No active database connection to retrieve documents.');
        }

        const documents = await dbServiceInstance.getDocuments(
          collectionName,
          limit,
          skip,
          params
        );
        const totalCount = await dbServiceInstance.getDocumentCount(collectionName, params);

        const { prepareDocumentForFrontend: internalPrepareDocumentForFrontend } = require('../utils/documentPreparation');
        const frontendDocuments = documents.map(internalPrepareDocumentForFrontend);

        return { documents: frontendDocuments, totalDocuments: totalCount };
      } catch (error: any) {
        internalMockLogger.error({ error, collectionName }, 'Backend: Failed to retrieve documents from collection');
        throw new Error(`Failed to retrieve documents from collection ${collectionName}: ${error.message}`);
      }
    }),
  };
});


describe('getCollectionDocuments', () => {
  const defaultCollectionName = 'testCollection';
  const defaultLimit = 20;
  const defaultSkip = 0;
  const defaultParams = {};

  beforeAll(() => {
    const indexModule = jest.requireMock('../index');
    getCollectionDocuments = indexModule.getCollectionDocuments;

    const DatabaseServiceModule = jest.requireMock('../services/DatabaseService');
    if (DatabaseServiceModule.DatabaseService.mock.instances.length === 0) {
      new DatabaseServiceModule.DatabaseService();
    }
    mockDatabaseServiceInstance = DatabaseServiceModule.DatabaseService.mock.instances[0] as jest.Mocked<DatabaseService>;

    if (!mockDatabaseServiceInstance) {
      throw new Error("mockDatabaseServiceInstance was not created. Check mock setup or import order.");
    }

    const pinoModule = jest.mocked(pino);
    mockLogger = pinoModule() as jest.Mocked<pino.Logger>;
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
    expect(mockGetDocuments).toHaveBeenCalledWith(defaultCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(defaultCollectionName, defaultParams);
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

    expect(mockGetDocuments).toHaveBeenCalledWith(collectionName, limit, skip, params);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(collectionName, params);
    expect(result.documents).toEqual(transformedDocuments);
    expect(result.totalDocuments).toBe(totalCount);
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);

    await expect(getCollectionDocuments(defaultCollectionName)).rejects.toThrow(
      'No active database connection to retrieve documents.'
    );
    expect(mockLogger.error).toHaveBeenCalledWith('No active database connection for getting collection documents.');
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
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: error, collectionName: defaultCollectionName },
      'Backend: Failed to retrieve documents from collection'
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
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: error, collectionName: defaultCollectionName },
      'Backend: Failed to retrieve documents from collection'
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
    expect(mockGetDocuments).toHaveBeenCalledWith(defaultCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(defaultCollectionName, defaultParams);
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
