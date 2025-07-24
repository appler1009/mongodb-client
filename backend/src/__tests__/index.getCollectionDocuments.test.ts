// src/__tests__/index.getCollectionDocuments.test.ts

// 1. Define the mock logger outside, so it can be cleared/reset
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// 2. Mock pino globally at the top level
jest.mock('pino', () => jest.fn(() => mockLogger));


// 3. Define MockObjectId and its spy
class MockObjectId {
  _bsontype: 'ObjectID';
  private _id: string;

  constructor(id?: string) {
    this._id = id || 'mockedObjectIdString';
    this._bsontype = 'ObjectID'; // Important for type checking in prepareDocumentForFrontend
  }

  toHexString(): string {
    return this._id;
  }
}
const mockToHexString = jest.spyOn(MockObjectId.prototype, 'toHexString');


// 4. Mock mongoDriverChooser to inject our MockObjectId
jest.mock('../services/mongoDriverChooser', () => {
  const actualMongoDriverChooser = jest.requireActual('../services/mongoDriverChooser');
  return {
    ...actualMongoDriverChooser,
    ObjectId: MockObjectId, // Override ObjectId with our mock
  };
});


// 5. Mock DatabaseService
const mockIsDbActive = jest.fn();
const mockGetDocuments = jest.fn();
const mockGetDocumentCount = jest.fn();

jest.mock('../services/DatabaseService', () => {
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getDocuments: mockGetDocuments,
      getDocumentCount: mockGetDocumentCount,
      setActiveDb: jest.fn(),
      getCollections: jest.fn(),
      getAllDocuments: jest.fn(),
      getCollectionSchemaAndSampleDocuments: jest.fn(),
    })),
    __esModule: true,
  };
});

// 6. Declare variables to hold the imported functions.
// We'll assign to them inside beforeEach to ensure they pick up fresh mocks.
let getCollectionDocuments: any;
let prepareDocumentForFrontend: any;

describe('getCollectionDocuments', () => {
  const testCollectionName = 'testCollection';
  const defaultLimit = 20;
  const defaultSkip = 0;
  const defaultParams = {};

  beforeEach(() => {
    // Clear all mocks for a clean slate before each test
    jest.clearAllMocks();
    mockIsDbActive.mockReset();
    mockGetDocuments.mockReset();
    mockGetDocumentCount.mockReset();
    mockToHexString.mockClear();

    // Dynamically import the module here. This ensures that:
    // 1. All mocks defined above are active.
    // 2. Each test gets a fresh instance of the module if it's cached,
    //    though Jest's mock hoisting usually handles this. The key is
    //    that the `logger` and `databaseService` *inside* `index.ts`
    //    are instantiated with our mocks.
    const indexModule = require('../index');
    getCollectionDocuments = indexModule.getCollectionDocuments;
    prepareDocumentForFrontend = indexModule.prepareDocumentForFrontend;
  });

  // Test Case 1: Successful retrieval and transformation
  it('should successfully retrieve and transform documents', async () => {
    const rawDocuments = [
      { _id: new MockObjectId('60d5ec49c1b7a6001c9c7e7b'), name: 'Test Doc 1', createdAt: new Date('2023-01-15T10:00:00.000Z') },
      { _id: new MockObjectId('60d5ec49c1b7a6001c9c7e7c'), value: 123, nested: { subId: new MockObjectId('60d5ec49c1b7a6001c9c7e7d') } },
      { plainField: 'hello', arrayField: [new Date('2022-02-01T00:00:00.000Z'), { subObjId: new MockObjectId('60d5ec49c1b7a6001c9c7e7e') }] },
      { stringField: 'abc', numberField: 123, booleanField: true, nullField: null }
    ];
    const totalCount = 100;

    mockIsDbActive.mockReturnValue(true);
    mockGetDocuments.mockResolvedValue(rawDocuments);
    mockGetDocumentCount.mockResolvedValue(totalCount);

    const result = await getCollectionDocuments(testCollectionName);

    // Assertions for debug logs (these are from the actual index.ts function)
    expect(mockLogger.debug).toHaveBeenCalledWith(`IPC: getCollectionDocuments called`); // This should now pass
    expect(mockLogger.debug).toHaveBeenCalledWith(`Retrieved ${rawDocuments.length} documents from collection ${testCollectionName}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(JSON.stringify(rawDocuments)); // Raw documents logged
    expect(mockLogger.debug).toHaveBeenCalledWith(`Transformed ${rawDocuments.length} documents`);

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, defaultParams);

    // Verify transformation
    const expectedTransformedDocuments = [
      { _id: '60d5ec49c1b7a6001c9c7e7b', name: 'Test Doc 1', createdAt: '2023-01-15T10:00:00.000Z' },
      { _id: '60d5ec49c1b7a6001c9c7e7c', value: 123, nested: { subId: '60d5ec49c1b7a6001c9c7e7d' } },
      { plainField: 'hello', arrayField: ['2022-02-01T00:00:00.000Z', { subObjId: '60d5ec49c1b7a6001c9c7e7e' }] },
      { stringField: 'abc', numberField: 123, booleanField: true, nullField: null }
    ];

    expect(mockToHexString).toHaveBeenCalledTimes(4); // One for each ObjectId instance

    expect(result.documents).toEqual(expectedTransformedDocuments);
    expect(result.totalDocuments).toEqual(totalCount);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  // Test Case 2: No active database connection
  it('should throw an error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);

    const expectedError = new Error('No active database connection to retrieve documents.');
    await expect(getCollectionDocuments(testCollectionName)).rejects.toThrow(expectedError.message);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: expectedError, collectionName: testCollectionName },
      'IPC: Failed to get documents from collection'
    );
  });

  // Test Case 3: databaseService.getDocuments() throws an error
  it('should handle errors from databaseService.getDocuments and re-throw', async () => {
    const serviceError = new Error('Failed to fetch documents from DB');
    mockIsDbActive.mockReturnValue(true);
    mockGetDocuments.mockRejectedValue(serviceError);

    await expect(getCollectionDocuments(testCollectionName)).rejects.toThrow(`Failed to retrieve documents from collection ${testCollectionName}: ${serviceError.message}`);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: serviceError, collectionName: testCollectionName },
      'IPC: Failed to get documents from collection'
    );
  });

  // Test Case 4: databaseService.getDocumentCount() throws an error
  it('should handle errors from databaseService.getDocumentCount and re-throw', async () => {
    const documentsFromService = [{ id: 1 }];
    const countError = new Error('Failed to get document count');
    mockIsDbActive.mockReturnValue(true);
    mockGetDocuments.mockResolvedValue(documentsFromService);
    mockGetDocumentCount.mockRejectedValue(countError);

    await expect(getCollectionDocuments(testCollectionName)).rejects.toThrow(`Failed to retrieve documents from collection ${testCollectionName}: ${countError.message}`);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, defaultParams);
    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: countError, collectionName: testCollectionName },
      'IPC: Failed to get documents from collection'
    );
  });

  // Test Case 5: Empty documents array
  it('should return empty array and total count 0 if no documents are found', async () => {
    mockIsDbActive.mockReturnValue(true);
    mockGetDocuments.mockResolvedValue([]);
    mockGetDocumentCount.mockResolvedValue(0);

    const result = await getCollectionDocuments(testCollectionName);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, defaultLimit, defaultSkip, defaultParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, defaultParams);
    expect(result).toEqual({ documents: [], totalDocuments: 0 });
    expect(mockLogger.debug).toHaveBeenCalledWith('Retrieved 0 documents from collection testCollection');
    expect(mockLogger.debug).toHaveBeenCalledWith('Transformed 0 documents');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  // Test Case 6: Custom limit, skip, and params
  it('should pass custom limit, skip, and params to databaseService methods', async () => {
    const customLimit = 50;
    const customSkip = 10;
    const customParams = { filter: '{ "isActive": true }', sort: '{ "name": 1 }' };
    const rawDocuments = [{ name: 'Doc A' }];
    const totalCount = 10;

    mockIsDbActive.mockReturnValue(true);
    mockGetDocuments.mockResolvedValue(rawDocuments);
    mockGetDocumentCount.mockResolvedValue(totalCount);

    const result = await getCollectionDocuments(testCollectionName, customLimit, customSkip, customParams);

    expect(mockLogger.debug).toHaveBeenCalledWith('IPC: getCollectionDocuments called');
    expect(mockGetDocuments).toHaveBeenCalledWith(testCollectionName, customLimit, customSkip, customParams);
    expect(mockGetDocumentCount).toHaveBeenCalledWith(testCollectionName, customParams);
    expect(result.documents).toEqual([{ name: 'Doc A' }]); // Transformed (no special types here)
    expect(result.totalDocuments).toEqual(totalCount);
  });

  // Test Case 7: Test prepareDocumentForFrontend with non-object/non-array inputs
  it('prepareDocumentForFrontend should return non-object/non-array inputs as is', () => {
    expect(prepareDocumentForFrontend(null)).toBeNull();
    expect(prepareDocumentForFrontend(undefined)).toBeUndefined();
    expect(prepareDocumentForFrontend('string')).toBe('string');
    expect(prepareDocumentForFrontend(123)).toBe(123);
    expect(prepareDocumentForFrontend(true)).toBe(true);
  });
});
