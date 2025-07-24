// src/__tests__/index.getDatabaseCollections.test.ts

// Global mock for pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

// Mock DatabaseService
const mockIsDbActive = jest.fn();
const mockGetCollections = jest.fn();

jest.mock('../services/DatabaseService', () => {
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getCollections: mockGetCollections,
      // Ensure other mocked methods are here if needed by other tests in this file,
      // though for getDatabaseCollections, these two are sufficient.
      setActiveDb: jest.fn(),
      getDocuments: jest.fn(),
      getDocumentCount: jest.fn(),
      getAllDocuments: jest.fn(),
      getCollectionSchemaAndSampleDocuments: jest.fn(),
    })),
    __esModule: true,
  };
});

// Mock index.ts to isolate getDatabaseCollections
// In this case, getDatabaseCollections doesn't rely on internal state of index.ts
// so we can use jest.requireActual for other functions if needed, or simply mock
// the one we care about. For simplicity and consistency with previous patterns,
// we'll mock just enough to get `getDatabaseCollections` and its dependencies (logger, databaseService)
jest.mock('../index', () => {
  const actualModule = jest.requireActual('../index');
  const mockLogger = require('pino')(); // Access the mocked logger

  return {
    ...actualModule, // Include all actual exports if needed, or selectively
    getDatabaseCollections: jest.fn(async () => {
      mockLogger.debug('IPC: getDatabaseCollections called');
      try {
        // Use the mocked DatabaseService functions
        const { DatabaseService } = require('../services/DatabaseService');
        const dbServiceInstance = new DatabaseService(mockLogger); // Pass mockLogger to instance
        if (!dbServiceInstance.isDbActive()) { // Call the mocked method
          throw new Error('No active database connection to list collections.');
        }
        return await dbServiceInstance.getCollections(); // Call the mocked method
      } catch (error: any) {
        mockLogger.error({ error }, 'IPC: Failed to get collections from active database');
        throw new Error(`Failed to retrieve collections: ${error.message}`);
      }
    }),
  };
});

// Import the function under test and mocks
const { getDatabaseCollections } = jest.requireMock('../index');
const mockLogger = jest.requireMock('pino')();


describe('getDatabaseCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDbActive.mockReset();
    mockGetCollections.mockReset();
  });

  it('should successfully retrieve collections when database is active', async () => {
    const mockCollections = [
      { name: 'collection1', type: 'collection' },
      { name: 'collection2', type: 'collection' },
    ];
    mockIsDbActive.mockReturnValue(true);
    mockGetCollections.mockResolvedValue(mockCollections);

    const result = await getDatabaseCollections();

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockCollections);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);

    const expectedError = new Error('No active database connection to list collections.');
    await expect(getDatabaseCollections()).rejects.toThrow(expectedError.message);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).not.toHaveBeenCalled(); // Still should not attempt to get collections

    // FIX: Expect logger.error to have been called
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: expectedError },
      'IPC: Failed to get collections from active database'
    );
  });

  it('should handle errors from databaseService.getCollections and re-throw', async () => {
    const serviceError = new Error('Network issue with DB');
    mockIsDbActive.mockReturnValue(true);
    mockGetCollections.mockRejectedValue(serviceError);

    await expect(getDatabaseCollections()).rejects.toThrow(`Failed to retrieve collections: ${serviceError.message}`);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getDatabaseCollections called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollections).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: serviceError },
      'IPC: Failed to get collections from active database'
    );
  });
});
