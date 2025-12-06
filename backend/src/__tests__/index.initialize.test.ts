import * as index from '../index';
import { ConnectionService } from '../services/ConnectionService';
import pino from 'pino';
import Store from 'electron-store';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('../services/ConnectionService', () => {
  const mockSetStore = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      setStore: mockSetStore,
    })),
    __esModule: true,
    mockSetStore,
  };
});

const { mockSetStore } = jest.requireMock('../services/ConnectionService');
const mockLogger = jest.requireMock('pino')();

describe('initialize', () => {
  let mockStore: Store<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockSetStore.mockClear();

    // Mock Store
    mockStore = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as Store<any>;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should initialize ConnectionService and return API methods', () => {
    const result = index.initialize(mockStore);

    expect(mockSetStore).toHaveBeenCalledWith(mockStore);
    expect(mockLogger.debug).toHaveBeenCalledWith('Backend: ConnectionService initialized with electron-store.');
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(result).toEqual({
      getConnections: expect.any(Function),
      addConnection: expect.any(Function),
      updateConnection: expect.any(Function),
      deleteConnection: expect.any(Function),
      connectToMongo: expect.any(Function),
      disconnectFromMongo: expect.any(Function),
      cancelConnectionAttempt: expect.any(Function),
      cancelQuery: expect.any(Function),
      getDatabaseCollections: expect.any(Function),
      getCollectionDocuments: expect.any(Function),
      exportCollectionDocuments: expect.any(Function),
      getCollectionDocumentCounts: expect.any(Function),
      getCollectionSchemaAndSampleDocuments: expect.any(Function),
      generateAIQuery: expect.any(Function),
    });
  });

  it('should throw error if connectionsStore is not provided', () => {
    expect(() => index.initialize(null as any)).toThrow('Connections store is required for backend operations.');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Connections store was not provided during backend initialization.'
    );
    expect(mockSetStore).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
