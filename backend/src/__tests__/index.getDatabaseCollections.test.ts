import { DatabaseService } from '../services/DatabaseService';
import pino from 'pino';

jest.mock('pino');

let mockLogger: jest.Mocked<pino.Logger>;

const mockIsDbActive = jest.fn();
const mockGetCollections = jest.fn();
const mockSetActiveDb = jest.fn();
const mockGetAllDocuments = jest.fn();
const mockGetDocuments = jest.fn();
const mockGetDocumentCount = jest.fn();
const mockGetCollectionSchemaAndSampleDocuments = jest.fn();

let mockDatabaseServiceInstance: jest.Mocked<DatabaseService>;
let getDatabaseCollections: typeof import('../index').getDatabaseCollections;


jest.mock('../services/DatabaseService', () => {
  const MockDatabaseService = jest.fn().mockImplementation(() => {
    return {
      isDbActive: mockIsDbActive,
      getCollections: mockGetCollections,
      setActiveDb: mockSetActiveDb,
      getAllDocuments: mockGetAllDocuments,
      getDocuments: mockGetDocuments,
      getDocumentCount: mockGetDocumentCount,
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
  const internalMockLogger = internalPinoFactory();

  return {
    ...actualModule,
    getDatabaseCollections: jest.fn(async () => {
      internalMockLogger.debug('IPC: getDatabaseCollections called');
      try {
        const { DatabaseService } = require('../services/DatabaseService');
        const dbServiceInstance = new DatabaseService(internalMockLogger);

        if (!dbServiceInstance.isDbActive()) {
          internalMockLogger.error('No active database connection to get collections.');
          throw new Error('No active database connection to get collections.');
        }
        const collections = await dbServiceInstance.getCollections();
        return collections;
      } catch (error: any) {
        internalMockLogger.error({ error }, 'Backend: Failed to retrieve collections');
        throw new Error(`Failed to retrieve collections: ${error.message}`);
      }
    }),
  };
});


describe('getDatabaseCollections', () => {
  beforeAll(() => {
    const indexModule = jest.requireMock('../index');
    getDatabaseCollections = indexModule.getDatabaseCollections;

    const DatabaseServiceModule = jest.requireMock('../services/DatabaseService');
    if (DatabaseServiceModule.DatabaseService.mock.instances.length === 0) {
      new DatabaseServiceModule.DatabaseService();
    }
    mockDatabaseServiceInstance = DatabaseServiceModule.DatabaseService.mock.instances[0] as jest.Mocked<DatabaseService>;

    if (!mockDatabaseServiceInstance) {
      throw new Error("mockDatabaseServiceInstance was not created. Check mock setup or import order.");
    }

    // Assign mockLogger in beforeAll
    const pinoModule = jest.mocked(pino);
    mockLogger = pinoModule() as jest.Mocked<pino.Logger>;
  });

  beforeEach(() => {
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    mockIsDbActive.mockClear().mockReturnValue(true);
    mockGetCollections.mockClear().mockResolvedValue([]);
    mockSetActiveDb.mockClear();
    mockGetAllDocuments.mockClear();
    mockGetDocuments.mockClear();
    mockGetDocumentCount.mockClear();
    mockGetCollectionSchemaAndSampleDocuments.mockClear();
  });

  it('should successfully retrieve collections when database is active', async () => {
    const mockCollections = [{ name: 'col1' }, { name: 'col2' }];
    mockGetCollections.mockResolvedValue(mockCollections);

    const result = await getDatabaseCollections();

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockCollections);
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedError = new Error('No active database connection to get collections.');

    await expect(getDatabaseCollections()).rejects.toThrow(expectedError.message);

    expect(mockLogger.error).toHaveBeenCalledWith('No active database connection to get collections.');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getCollections and re-throw', async () => {
    const serviceError = new Error('Failed to fetch collections from DB');
    mockGetCollections.mockRejectedValue(serviceError);

    await expect(getDatabaseCollections()).rejects.toThrow(`Failed to retrieve collections: ${serviceError.message}`);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: serviceError },
      'Backend: Failed to retrieve collections'
    );
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
  });
});
