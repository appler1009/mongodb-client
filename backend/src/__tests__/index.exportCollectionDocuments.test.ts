import { DatabaseService } from '../services/DatabaseService';
import pino from 'pino';
jest.mock('pino');
let mockLogger: jest.Mocked<pino.Logger>;

const mockGetDocuments = jest.fn();
const mockGetDocumentCount = jest.fn();
const mockSetActiveDb = jest.fn();
const mockIsDbActive = jest.fn();
const mockGetCollections = jest.fn();
const mockGetAllDocuments = jest.fn();
const mockGetCollectionSchemaAndSampleDocuments = jest.fn();

let mockDatabaseServiceInstance: jest.Mocked<DatabaseService>;
let getCollectionDocuments: typeof import('../index').getCollectionDocuments;

jest.mock('../services/DatabaseService', () => {
  const MockDatabaseService = jest.fn().mockImplementation(() => {
    return {
      getDocuments: mockGetDocuments,
      getDocumentCount: mockGetDocumentCount,
      setActiveDb: mockSetActiveDb,
      isDbActive: mockIsDbActive,
      getCollections: mockGetCollections,
      getAllDocuments: mockGetAllDocuments,
      getCollectionSchemaAndSampleDocuments: mockGetCollectionSchemaAndSampleDocuments,
      activeDb: null,
      connectionService: {} as any,
    };
  });
  return { DatabaseService: MockDatabaseService };
});

const mockedPrepareDocumentForFrontend = jest.fn(doc => doc);
jest.mock('../utils/documentPreparation', () => ({
  prepareDocumentForFrontend: mockedPrepareDocumentForFrontend,
}));

jest.mock('../index', () => {
  const actualModule = jest.requireActual('../index');
  const internalPinoFactory = jest.requireMock('pino') as jest.MockedFunction<typeof pino>;
  const internalMockLogger = internalPinoFactory() as jest.Mocked<pino.Logger>;

  return {
    ...actualModule,
    getCollectionDocuments: jest.fn(async (collectionName: string, limit: number = 20, skip: number = 0, params: any = {}) => {
      internalMockLogger.debug('IPC: getCollectionDocuments called');
      try {
        const { DatabaseService } = require('../services/DatabaseService');
        const dbServiceInstance = new DatabaseService(internalMockLogger);

        if (!dbServiceInstance.isDbActive()) {
          internalMockLogger.error('No active database connection to get documents.');
          throw new Error('No active database connection to get documents.');
        }

        const documents = await dbServiceInstance.getDocuments(collectionName, limit, skip, params);
        const count = await dbServiceInstance.getDocumentCount(collectionName, params);

        const { prepareDocumentForFrontend: internalPrepareDocumentForFrontend } = require('../utils/documentPreparation');
        const transformedDocuments = documents.map((doc: any) => internalPrepareDocumentForFrontend(doc));

        return { documents: transformedDocuments, count };
      } catch (error: any) {
        internalMockLogger.error({ error, collectionName, limit, skip }, 'Backend: Failed to retrieve documents');
        throw new Error(`Failed to retrieve documents for collection ${collectionName}: ${error.message}`);
      }
    }),
  };
});


describe('getCollectionDocuments', () => {
  const testCollectionName = 'myTestCollection';
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
    mockedPrepareDocumentForFrontend.mockClear().mockImplementation(doc => doc);
  });

  it('should successfully retrieve and transform documents with count', async () => {
    const rawDocuments = [{ _id: '1', data: 'abc' }, { _id: '2', data: 'xyz' }];
    const expectedCount = 2;

    mockGetDocuments.mockResolvedValue(rawDocuments);
    mockGetDocumentCount.mockResolvedValue(expectedCount);
    mockedPrepareDocumentForFrontend
      .mockImplementationOnce(doc => ({ ...doc, transformed: true }))
      .mockImplementationOnce(doc => ({ ...doc, transformed: true }));

    const result = await getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip, defaultParams);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, defaultParams);
    expect(mockedPrepareDocumentForFrontend).toHaveBeenCalledTimes(rawDocuments.length);
    expect(result.documents.length).toBe(rawDocuments.length);
    expect(result.documents[0]).toEqual({ ...rawDocuments[0], transformed: true });
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedError = new Error('No active database connection to get documents.');

    await expect(getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip)).rejects.toThrow(expectedError.message);

    expect(mockLogger.error).toHaveBeenCalledWith('No active database connection to get documents.');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
    expect(mockedPrepareDocumentForFrontend).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getDocuments and re-throw', async () => {
    const serviceError = new Error('Failed to fetch documents from DB');
    mockGetDocuments.mockRejectedValue(serviceError);

    await expect(getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip, defaultParams)).rejects.toThrow(
      `Failed to retrieve documents for collection ${testCollectionName}: ${serviceError.message}`
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
    expect(mockedPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: serviceError, collectionName: testCollectionName, limit: defaultLimit, skip: defaultSkip },
      'Backend: Failed to retrieve documents'
    );
  });

  it('should handle errors from databaseService.getDocumentCount and re-throw', async () => {
    const serviceError = new Error('Failed to fetch document count from DB');
    mockGetDocumentCount.mockRejectedValue(serviceError);
    mockGetDocuments.mockResolvedValue([]);

    await expect(getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip, defaultParams)).rejects.toThrow(
      `Failed to retrieve documents for collection ${testCollectionName}: ${serviceError.message}`
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledTimes(1);
    expect(mockedPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: serviceError, collectionName: testCollectionName, limit: defaultLimit, skip: defaultSkip },
      'Backend: Failed to retrieve documents'
    );
  });

  it('should retrieve documents for an empty collection', async () => {
    mockGetDocuments.mockResolvedValue([]);
    mockGetDocumentCount.mockResolvedValue(0);

    const result = await getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip);

    expect(mockGetDocuments).toHaveBeenCalledTimes(1);
    expect(mockGetDocumentCount).toHaveBeenCalledTimes(1);
    expect(result.documents).toEqual([]);
    expect(mockedPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should pass custom parameters to databaseService methods', async () => {
    const customParams = { filter: '{"status":"active"}', sort: '{"date":-1}' };
    mockGetDocuments.mockResolvedValue([]);
    mockGetDocumentCount.mockResolvedValue(0);

    await getCollectionDocuments(testCollectionName, defaultLimit, defaultSkip, customParams);

    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, customParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, customParams);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
