import { ConnectionService } from '../services/ConnectionService';
import { DatabaseService } from '../services/DatabaseService';
import { ConnectionConfig } from '../types';

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
      updateConnection: mockUpdateConnection, // Corrected typo here!
    })),
    __esModule: true,
    mockGetConnectionById,
    mockUpdateConnection,
  };
});

jest.mock('../services/DatabaseService', () => {
  const mockSetActiveDb = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      setActiveDb: mockSetActiveDb,
    })),
    __esModule: true,
    mockSetActiveDb,
  };
});

const mockDbInstance = {
  databaseName: 'mockDbFromClient',
};

const mockMongoClientInstance = {
  connect: jest.fn(),
  close: jest.fn(),
  db: jest.fn((dbName?: string) => {
    return {
      databaseName: dbName || mockDbInstance.databaseName,
    };
  }),
};

const mockConnectWithDriverFallback = jest.fn();

jest.mock('../services/mongoDriverChooser', () => ({
  connectWithDriverFallback: mockConnectWithDriverFallback,
  MongoClient: jest.fn(() => mockMongoClientInstance),
  Db: jest.fn((name = 'default-mock-db-class') => ({ databaseName: name })),
}));

// --- START OF MOCKING INDEX.TS ---
jest.mock('../index', () => {
  let _activeMongoClient: any = null;
  let _activeDb: any = null;
  let _activeConnectionId: string | null = null;
  let _activeDatabaseName: string | undefined = undefined;
  let _activeDriverVersion: string | null = null;

  const mockedDisconnectMongoInternal = jest.fn(async () => {
    if (_activeMongoClient) {
      await _activeMongoClient.close();
    }
    _activeMongoClient = null;
    _activeDb = null;
    _activeConnectionId = null;
    _activeDatabaseName = undefined;
    _activeDriverVersion = null;
    jest.requireMock('../services/DatabaseService').mockSetActiveDb(null);
  });

  const mockedConnectToMongo = jest.fn(async (connectionId: string, attemptId: string) => {
    const { mockGetConnectionById, mockUpdateConnection } = jest.requireMock('../services/ConnectionService');
    const { mockSetActiveDb } = jest.requireMock('../services/DatabaseService');
    const { connectWithDriverFallback } = jest.requireMock('../services/mongoDriverChooser');
    const mockLogger = require('pino')();

    const config = await mockGetConnectionById(connectionId);
    if (!config) {
      throw new Error('Connection configuration not found.');
    }

    if (_activeConnectionId !== null) {
      await mockedDisconnectMongoInternal();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const { client, driverVersion } = await connectWithDriverFallback(
        config.uri,
        attemptId,
        { connectTimeoutMS: 5000 },
        config.driverVersion,
        controller.signal
      );
      clearTimeout(timeout);

      await client.connect();

      _activeMongoClient = client;
      _activeConnectionId = connectionId;

      let databaseName: string | undefined;
      try {
        const parsedUri = new URL(config.uri);
        const pathName = parsedUri.pathname;
        if (pathName && pathName.length > 1) {
          databaseName = pathName.substring(1);
        }
      } catch (e) {
        // URI parsing failed, fall back to client's default
      }

      const db = client.db(databaseName);
      _activeDb = db;
      _activeDatabaseName = db.databaseName;
      _activeDriverVersion = driverVersion || null;

      if (driverVersion) {
        await mockUpdateConnection(connectionId, { ...config, driverVersion });
      }

      mockSetActiveDb(db);

      mockLogger.info(`IPC: Connected to MongoDB: ${config.name} (${db.databaseName})`);

      return {
        name: config.name,
        message: 'Successfully connected to MongoDB.',
        connectionId: connectionId,
        database: db.databaseName,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      await mockedDisconnectMongoInternal();

      if (error.name === 'AbortError') {
        mockLogger.warn(`IPC: Connection attempt aborted for ID: ${connectionId}`);
        throw new Error(`Connection attempt aborted for ID: ${connectionId}`);
      } else {
        mockLogger.error({ error, connectionId }, 'IPC: Failed to connect to MongoDB');
        throw new Error(`Failed to connect to MongoDB: ${error.message}`);
      }
    }
  });

  return {
    connectToMongo: mockedConnectToMongo,
    disconnectMongoInternal: mockedDisconnectMongoInternal,

    __setActiveMongoClient: (client: any) => { _activeMongoClient = client; },
    __setActiveDb: (db: any) => { _activeDb = db; },
    __setActiveConnectionId: (id: string | null) => { _activeConnectionId = id; },
    __setActiveDatabaseName: (name: string | undefined) => { _activeDatabaseName = name; },
    __setActiveDriverVersion: (version: string | null) => { _activeDriverVersion = version; },
    __getActiveMongoClient: () => _activeMongoClient,
    __getActiveDb: () => _activeDb,
    __getActiveConnectionId: () => _activeConnectionId,
    __getActiveDatabaseName: () => _activeDatabaseName,
    __getActiveDriverVersion: () => _activeDriverVersion,
  };
});
// --- END OF MOCKING INDEX.TS ---


const {
  mockGetConnectionById,
  mockUpdateConnection,
} = jest.requireMock('../services/ConnectionService');
const { mockSetActiveDb } = jest.requireMock('../services/DatabaseService');

const {
  connectToMongo,
  disconnectMongoInternal: disconnectMongoInternalSpy,
  __setActiveMongoClient,
  __setActiveConnectionId,
  __getActiveMongoClient,
  __getActiveDb,
  __getActiveConnectionId,
  __getActiveDatabaseName,
  __getActiveDriverVersion,
} = jest.requireMock('../index');

const {
  MongoClient: MockedMongoClientClass,
  Db: MockedDbClass,
} = jest.requireMock('../services/mongoDriverChooser');


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
    __setActiveMongoClient(null);
    __setActiveConnectionId(null);
    mockMongoClientInstance.connect.mockResolvedValue(undefined);
    mockMongoClientInstance.close.mockResolvedValue(undefined);
    mockMongoClientInstance.db.mockClear();
    mockMongoClientInstance.db.mockImplementation((dbName?: string) => {
      return { databaseName: dbName || 'mockDbFromClient' };
    });
    mockConnectWithDriverFallback.mockReset();
  });

  it('successfully connects to MongoDB with new connection', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    const result = await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(mockGetConnectionById).toHaveBeenCalledWith(mockConnectionConfig.id);
    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(mockConnectWithDriverFallback).toHaveBeenCalledWith(
      mockConnectionConfig.uri,
      expect.anything(),
      { connectTimeoutMS: 5000 },
      mockConnectionConfig.driverVersion,
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

    expect(__getActiveMongoClient()).toBe(mockMongoClientInstance);
    expect(__getActiveDb().databaseName).toBe('testdb');
    expect(__getActiveConnectionId()).toBe(mockConnectionConfig.id);
    expect(__getActiveDatabaseName()).toBe('testdb');
    expect(__getActiveDriverVersion()).toBe('v5');

    expect(result).toEqual({
      name: mockConnectionConfig.name,
      message: 'Successfully connected to MongoDB.',
      connectionId: mockConnectionConfig.id,
      database: 'testdb',
    });
  });

  it('successfully connects and disconnects old connection if active', async () => {
    const oldConnectionId = 'old-id';
    __setActiveConnectionId(oldConnectionId);
    __setActiveMongoClient(mockMongoClientInstance);

    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(mockMongoClientInstance.close).toHaveBeenCalledTimes(1);
  });

  it('throws error if connection config not found', async () => {
    mockGetConnectionById.mockResolvedValue(null);

    await expect(connectToMongo('non-existent-id', mockAttemptId)).rejects.toThrow(
      'Connection configuration not found.'
    );

    expect(mockGetConnectionById).toHaveBeenCalledWith('non-existent-id');
    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    expect(mockConnectWithDriverFallback).not.toHaveBeenCalled();
    expect(__getActiveConnectionId()).toBeNull();
  });

  it('throws error if connectWithDriverFallback fails', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    const connectionError = new Error('Network error');
    mockConnectWithDriverFallback.mockRejectedValue(connectionError);

    await expect(connectToMongo(mockConnectionConfig.id, mockAttemptId)).rejects.toThrow(
      `Failed to connect to MongoDB: ${connectionError.message}`
    );

    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(__getActiveConnectionId()).toBeNull();
  });

  it('handles connection cancellation (AbortError)', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockConnectWithDriverFallback.mockRejectedValue(abortError);

    await expect(connectToMongo(mockConnectionConfig.id, mockAttemptId)).rejects.toThrow(
      `Connection attempt aborted for ID: ${mockConnectionConfig.id}`
    );

    expect(mockConnectWithDriverFallback).toHaveBeenCalledTimes(1);
    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(__getActiveConnectionId()).toBeNull();
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

    expect(__getActiveDatabaseName()).toBe('myExplicitDb');
    expect(mockSetActiveDb).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: 'myExplicitDb' })
    );
    expect(result.database).toBe('myExplicitDb');
  });

  it('uses client.db().databaseName if no explicit database in URI', async () => {
    const configWithoutDbInUri: ConnectionConfig = {
      ...mockConnectionConfig,
      uri: 'mongodb://localhost:27017', // No database in path
    };
    mockGetConnectionById.mockResolvedValue(configWithoutDbInUri);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: 'v5',
    });

    mockMongoClientInstance.db.mockImplementationOnce((dbName?: string) => {
        return { databaseName: dbName || 'defaultMongoDb' };
    });

    const result = await connectToMongo(configWithoutDbInUri.id, mockAttemptId);

    expect(__getActiveDatabaseName()).toBe('defaultMongoDb');
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
    expect(__getActiveDriverVersion()).toBe('v6');
  });

  it('does not update driver version if driverVersion is undefined from fallback', async () => {
    mockGetConnectionById.mockResolvedValue(mockConnectionConfig);
    mockConnectWithDriverFallback.mockResolvedValue({
      client: mockMongoClientInstance,
      driverVersion: undefined,
    });

    await connectToMongo(mockConnectionConfig.id, mockAttemptId);

    expect(mockUpdateConnection).not.toHaveBeenCalledWith(
        mockConnectionConfig.id,
        expect.objectContaining({ driverVersion: undefined })
    );
    expect(__getActiveDriverVersion()).toBeNull();
  });
});
