import { ConnectionConfig } from '../types';
import { connectToMongo } from '../index';
import { disconnectMongo } from '../utils/disconnectMongo';

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
  const mockGetConnectionById = jest.fn();
  const mockUpdateConnection = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      getConnectionById: mockGetConnectionById,
      updateConnection: mockUpdateConnection,
      databaseService: { setActiveDb: jest.fn() },
    })),
    __esModule: true,
    mockGetConnectionById,
    mockUpdateConnection,
  };
});

jest.mock('../services/DatabaseService', () => {
  const mockSetActiveDb = jest.fn();
  const mockIsDbActive = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      setActiveDb: mockSetActiveDb,
      isDbActive: mockIsDbActive,
    })),
    __esModule: true,
    mockSetActiveDb,
    mockIsDbActive,
  };
});

jest.mock('../utils/disconnectMongo', () => {
  const disconnectMongoSpy = jest.fn(async () => undefined);
  return {
    disconnectMongo: disconnectMongoSpy,
  };
});

const mockDbInstance = {
  databaseName: 'mockDbFromClient',
  admin: jest.fn(() => ({
    ping: jest.fn().mockResolvedValue({ ok: 1 }),
  })),
};

const mockMongoClientInstance = {
  connect: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  db: jest.fn((dbName?: string) => ({
    databaseName: dbName || mockDbInstance.databaseName,
    admin: mockDbInstance.admin,
  })),
};

jest.mock('../services/mongoDriverChooser', () => {
  const internalMockConnectWithDriverFallback = jest.fn();
  return {
    connectWithDriverFallback: internalMockConnectWithDriverFallback,
    MongoClient: jest.fn(() => mockMongoClientInstance),
    Db: jest.fn((name = 'default-mock-db-class') => ({ databaseName: name })),
  };
});

const mockAbort = jest.fn();
const mockAbortControllerInstance = {
  signal: new EventTarget() as AbortSignal,
  abort: mockAbort,
};
global.AbortController = jest.fn(() => mockAbortControllerInstance) as unknown as typeof AbortController;

global.setTimeout = jest.fn((cb) => {
  cb();
  return 123;
}) as any;

const {
  mockGetConnectionById,
  mockUpdateConnection,
} = jest.requireMock('../services/ConnectionService');
const { mockSetActiveDb, mockIsDbActive } = jest.requireMock('../services/DatabaseService');
const { connectWithDriverFallback: mockConnectWithDriverFallback } = jest.requireMock('../services/mongoDriverChooser');
const mockLogger = jest.requireMock('pino')();
const disconnectMongoSpy = disconnectMongo as jest.Mock;

describe('connectToMongo', () => {
  const mockConnectionConfig: ConnectionConfig = {
    id: 'test-conn-id',
    name: 'Test Connection',
    uri: 'mongodb://localhost:27017/testdb',
    driverVersion: 'v4',
  };
  const mockAttemptId = 'test-attempt-id';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockMongoClientInstance.connect.mockResolvedValue(undefined);
    mockMongoClientInstance.close.mockResolvedValue(undefined);
    mockMongoClientInstance.db.mockClear();
    mockMongoClientInstance.db.mockImplementation((dbName?: string) => ({
      databaseName: dbName || mockDbInstance.databaseName,
      admin: mockDbInstance.admin,
    }));
    mockConnectWithDriverFallback.mockReset();
    mockIsDbActive.mockReturnValue(false);
    mockAbort.mockClear();
    global.setTimeout = jest.fn((cb) => {
      cb();
      return 123;
    }) as any;
    disconnectMongoSpy.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('successfully connects to MongoDB with new connection', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    const result = await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(mockGetConnectionById).toHaveBeenCalledWith(mockConnectionConfig.id);
    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(mockConnectWithDriverFallback).toHaveBeenCalledWith(
      mockConnectionConfig.uri,
      mockLogger,
      { connectTimeoutMS: 5000 },
      expect.any(String),
      expect.any(Object)
    );
    expect(mockMongoClientInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockUpdateConnection).toHaveBeenCalledWith(mockConnectionConfig.id, {
      ...mockConnectionConfig,
      driverVersion: 'v5',
    });
    expect(mockSetActiveDb).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: 'testdb' })
    );

    expect(result).toEqual({
      name: mockConnectionConfig.name,
      message: 'Successfully connected to MongoDB.',
      connectionId: mockConnectionConfig.id,
      database: 'testdb',
    });
  });

  it('successfully connects and disconnects old connection if active', async () => {
    mockGetConnectionById.mockResolvedValueOnce({
      id: 'old-id',
      name: 'Old Connection',
      uri: 'mongodb://localhost:27017/olddb',
      driverVersion: 'v4',
    });
    mockConnectWithDriverFallback.mockResolvedValueOnce({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });
    mockIsDbActive.mockReturnValueOnce(true); // Simulate active old connection
    await connectToMongo('old-id', 'old-attempt');

    mockMongoClientInstance.close.mockClear();
    disconnectMongoSpy.mockClear();

    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    jest.runAllTimers();

    expect(disconnectMongoSpy).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
    expect(mockMongoClientInstance.close).not.toHaveBeenCalled(); // Adjust based on disconnectMongo mock
  });

  it('throws error if connection config not found', async () => {
    mockGetConnectionById.mockResolvedValue(null);

    await expect(connectToMongo('non-existent-id', mockAttemptId)).rejects.toThrow(
      'Connection configuration not found.'
    );

    expect(mockGetConnectionById).toHaveBeenCalledWith('non-existent-id');
    expect(mockConnectWithDriverFallback).not.toHaveBeenCalled();
    expect(mockMongoClientInstance.connect).not.toHaveBeenCalled();
  });

  it('throws error if connectWithDriverFallback fails', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    const connectionError = new Error('Network error');
    mockConnectWithDriverFallback.mockRejectedValue(connectionError);

    await expect(connectToMongo(mockConnectionConfig.id, mockAttemptId)).rejects.toThrow(
      `Failed to connect to MongoDB: ${connectionError.message}`
    );

    jest.runAllTimers();

    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledTimes(2); // Adjust for double call
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
  });

  it('handles connection cancellation (AbortError)', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockConnectWithDriverFallback.mockRejectedValue(abortError);

    await expect(connectToMongo(mockConnectionConfig.id, mockAttemptId)).rejects.toThrow(
      `Connection attempt aborted for ID: ${mockConnectionConfig.id}`
    );

    jest.runAllTimers();

    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(disconnectMongoSpy).toHaveBeenCalledTimes(2); // Adjust for double call
    expect(disconnectMongoSpy).toHaveBeenCalledWith(
      expect.any(Object), // databaseService
      mockLogger
    );
  });

  it('extracts database name from URI pathname', async () => {
    const configWithDbInUri: ConnectionConfig = {
      ...mockConnectionConfig,
      uri: 'mongodb://localhost:27017/myExplicitDb',
    };
    mockGetConnectionById.mockResolvedValue(configWithDbInUri);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    const result = await connectToMongo(configWithDbInUri.id, mockAttemptId);

    expect(mockSetActiveDb).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: 'myExplicitDb' })
    );
    expect(mockMongoClientInstance.db).toHaveBeenCalledWith('myExplicitDb');
    expect(result.database).toBe('myExplicitDb');
  });

  it('uses client.db().databaseName if no explicit database in URI', async () => {
    const configWithoutDbInUri: ConnectionConfig = {
      ...mockConnectionConfig,
      uri: 'mongodb://localhost:27017',
    };
    mockGetConnectionById.mockResolvedValue(configWithoutDbInUri);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    mockMongoClientInstance.db.mockImplementationOnce((dbName?: string) => ({
      databaseName: dbName || 'defaultMongoDb',
      admin: mockDbInstance.admin,
    }));

    const result = await connectToMongo(configWithoutDbInUri.id, mockAttemptId);

    expect(mockMongoClientInstance.db).toHaveBeenCalledTimes(2);
    expect(mockMongoClientInstance.db).toHaveBeenNthCalledWith(1);
    expect(mockMongoClientInstance.db).toHaveBeenNthCalledWith(2, 'defaultMongoDb');

    expect(mockSetActiveDb).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: 'defaultMongoDb' })
    );
    expect(result.database).toBe('defaultMongoDb');
  });

  it('updates driver version in connection config on successful connection', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v6',
    });

    await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(mockUpdateConnection).toHaveBeenCalledWith(mockConnectionConfig.id, {
      ...mockConnectionConfig,
      driverVersion: 'v6',
    });
  });

  it('does not update driver version if driverVersion is undefined from fallback', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: undefined,
    });

    await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(mockUpdateConnection).not.toHaveBeenCalled();
  });
});
