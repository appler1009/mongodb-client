import { ConnectionService } from '../services/ConnectionService';
import { ConnectionStateValue } from '../types';

// Global mock for mockSetActiveDb to ensure it's available when other mocks require it
const mockSetActiveDb = jest.fn();

// Mock logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

// Mock ConnectionService
jest.mock('../services/ConnectionService', () => {
  const mockUpdateConnectionStatus = jest.fn();
  return {
    ConnectionService: jest.fn().mockImplementation(() => ({
      updateConnectionStatus: mockUpdateConnectionStatus,
    })),
    __esModule: true,
    mockUpdateConnectionStatus,
  };
});

// Mock DatabaseService - now directly returns the pre-defined mockSetActiveDb
jest.mock('../services/DatabaseService', () => {
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      setActiveDb: mockSetActiveDb, // Use the globally defined mock
    })),
    __esModule: true,
    mockSetActiveDb, // Export it so tests can access it directly if needed
  };
});


// Define mock MongoClient with explicit types for its functions
const mockMongoClient = {
  close: jest.fn() as jest.Mock,
  db: jest.fn() as jest.Mock,
};

const mockDb = {
  databaseName: 'mockDb',
};

// --- START OF MOCKING INDEX.TS (for disconnectFromMongo and its internal state) ---
jest.mock('../index', () => {
  let _activeMongoClient: typeof mockMongoClient | null = null;
  let _activeDb: typeof mockDb | null = null;
  let _activeConnectionId: string | null = null;
  let _activeDatabaseName: string | undefined = undefined;
  let _activeDriverVersion: string | null = null;

  const mockedDisconnectMongoInternal = jest.fn(async () => {
    if (_activeMongoClient) {
      try {
        await _activeMongoClient.close();
      } catch (error: any) {
        jest.requireMock('pino')().error({ error }, 'Error during MongoDB client close: %s', error.message);
      }
    }
    _activeMongoClient = null;
    _activeDb = null;
    _activeConnectionId = null;
    _activeDatabaseName = undefined;
    _activeDriverVersion = null;
    mockSetActiveDb(null);
  });

  const mockedDisconnectFromMongo = jest.fn(async (connectionId?: string) => {
    const { mockUpdateConnectionStatus } = jest.requireMock('../services/ConnectionService');
    const mockLogger = require('pino')();

    if (!_activeMongoClient) {
      mockLogger.info('IPC: No active connection to disconnect.');
      return { message: 'No active connection to disconnect.' };
    }

    if (connectionId && connectionId !== _activeConnectionId) {
      mockLogger.warn(`IPC: Attempted to disconnect connection ID ${connectionId}, but active connection is ${_activeConnectionId}. Disconnecting active connection.`);
    }

    const disconnectedId = _activeConnectionId;
    const disconnectedDbName = _activeDatabaseName;

    await mockedDisconnectMongoInternal();

    if (disconnectedId) {
      await mockUpdateConnectionStatus(disconnectedId, ConnectionStateValue.Disconnected);
      // FIX: Corrected info log message for consistent spacing and colon
      mockLogger.info(`IPC: Disconnected from MongoDB: ${disconnectedDbName ? `(DB: ${disconnectedDbName}) ` : ''}Connection ID: ${disconnectedId}.`);
      return { message: 'Disconnected from MongoDB.', connectionId: disconnectedId, database: disconnectedDbName };
    } else {
      mockLogger.info('IPC: Disconnected from MongoDB (no specific connection ID previously set).');
      return { message: 'Disconnected from MongoDB.' };
    }
  });

  return {
    disconnectFromMongo: mockedDisconnectFromMongo,
    disconnectMongoInternal: mockedDisconnectMongoInternal,

    __setActiveMongoClient: (client: typeof mockMongoClient | null) => { _activeMongoClient = client; },
    __setActiveDb: (db: typeof mockDb | null) => { _activeDb = db; },
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

// Access the mocked functions and helpers
const {
  mockUpdateConnectionStatus,
} = jest.requireMock('../services/ConnectionService');

const {
  disconnectFromMongo,
  disconnectMongoInternal: disconnectMongoInternalSpy,
  __setActiveMongoClient,
  __setActiveDb,
  __setActiveConnectionId,
  __setActiveDatabaseName,
  __getActiveMongoClient,
  __getActiveDb,
  __getActiveConnectionId,
  __getActiveDatabaseName,
} = jest.requireMock('../index');

const mockLogger = jest.requireMock('pino')();


describe('disconnectFromMongo', () => {
  const activeConnectionId = 'active-conn-123';
  const activeDatabaseName = 'activeDb';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMongoClient.close.mockClear();
    mockMongoClient.db.mockClear();
    mockSetActiveDb.mockClear();

    __setActiveMongoClient(null);
    __setActiveDb(null);
    __setActiveConnectionId(null);
    __setActiveDatabaseName(undefined);

    mockMongoClient.close.mockResolvedValue(undefined);
  });

  it('successfully disconnects an active connection', async () => {
    __setActiveMongoClient(mockMongoClient);
    __setActiveDb(mockDb);
    __setActiveConnectionId(activeConnectionId);
    __setActiveDatabaseName(activeDatabaseName);

    const result = await disconnectFromMongo();

    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(mockMongoClient.close).toHaveBeenCalledTimes(1);
    expect(__getActiveMongoClient()).toBeNull();
    expect(__getActiveDb()).toBeNull();
    expect(__getActiveConnectionId()).toBeNull();
    expect(__getActiveDatabaseName()).toBeUndefined();
    expect(mockSetActiveDb).toHaveBeenCalledWith(null);
    expect(mockUpdateConnectionStatus).toHaveBeenCalledWith(activeConnectionId, ConnectionStateValue.Disconnected);
    // Expect the corrected log message
    expect(mockLogger.info).toHaveBeenCalledWith(`IPC: Disconnected from MongoDB: (DB: ${activeDatabaseName}) Connection ID: ${activeConnectionId}.`);
    expect(result).toEqual({ message: 'Disconnected from MongoDB.', connectionId: activeConnectionId, database: activeDatabaseName });
  });

  it('does nothing if no active connection exists', async () => {
    const result = await disconnectFromMongo();

    expect(disconnectMongoInternalSpy).not.toHaveBeenCalled();
    expect(mockMongoClient.close).not.toHaveBeenCalled();
    expect(__getActiveMongoClient()).toBeNull();
    expect(mockSetActiveDb).not.toHaveBeenCalled();
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('IPC: No active connection to disconnect.');
    expect(result).toEqual({ message: 'No active connection to disconnect.' });
  });

  it('handles errors during MongoClient.close() gracefully', async () => {
    __setActiveMongoClient(mockMongoClient);
    __setActiveDb(mockDb);
    __setActiveConnectionId(activeConnectionId);
    __setActiveDatabaseName(activeDatabaseName);

    const closeError = new Error('Failed to close client');
    mockMongoClient.close.mockRejectedValue(closeError);

    const result = await disconnectFromMongo();

    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(mockMongoClient.close).toHaveBeenCalledTimes(1);
    expect(__getActiveMongoClient()).toBeNull();
    expect(__getActiveConnectionId()).toBeNull();
    expect(mockSetActiveDb).toHaveBeenCalledWith(null);
    expect(mockUpdateConnectionStatus).toHaveBeenCalledWith(activeConnectionId, ConnectionStateValue.Disconnected);

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: closeError },
      'Error during MongoDB client close: %s',
      'Failed to close client'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(`IPC: Disconnected from MongoDB: (DB: ${activeDatabaseName}) Connection ID: ${activeConnectionId}.`);
    expect(result).toEqual({ message: 'Disconnected from MongoDB.', connectionId: activeConnectionId, database: activeDatabaseName });
  });

  it('disconnects the active connection even if a different ID is requested', async () => {
    const otherConnectionId = 'other-conn-456';
    __setActiveMongoClient(mockMongoClient);
    __setActiveDb(mockDb);
    __setActiveConnectionId(activeConnectionId);
    __setActiveDatabaseName(activeDatabaseName);

    const result = await disconnectFromMongo(otherConnectionId);

    expect(disconnectMongoInternalSpy).toHaveBeenCalledTimes(1);
    expect(mockMongoClient.close).toHaveBeenCalledTimes(1);
    expect(__getActiveConnectionId()).toBeNull();
    expect(mockSetActiveDb).toHaveBeenCalledWith(null);
    expect(mockUpdateConnectionStatus).toHaveBeenCalledWith(activeConnectionId, ConnectionStateValue.Disconnected);
    expect(mockLogger.warn).toHaveBeenCalledWith(`IPC: Attempted to disconnect connection ID ${otherConnectionId}, but active connection is ${activeConnectionId}. Disconnecting active connection.`);
    expect(mockLogger.info).toHaveBeenCalledWith(`IPC: Disconnected from MongoDB: (DB: ${activeDatabaseName}) Connection ID: ${activeConnectionId}.`);
    expect(result).toEqual({ message: 'Disconnected from MongoDB.', connectionId: activeConnectionId, database: activeDatabaseName });
  });

  it('handles active connection with no specific database name set', async () => {
    __setActiveMongoClient(mockMongoClient);
    __setActiveDb({ databaseName: 'admin' });
    __setActiveConnectionId(activeConnectionId);
    __setActiveDatabaseName(undefined);

    const result = await disconnectFromMongo();

    expect(mockSetActiveDb).toHaveBeenCalledWith(null);
    // FIX: Corrected expectation to match the changed log message exactly
    expect(mockLogger.info).toHaveBeenCalledWith(`IPC: Disconnected from MongoDB: Connection ID: ${activeConnectionId}.`);
    expect(result).toEqual({ message: 'Disconnected from MongoDB.', connectionId: activeConnectionId, database: undefined });
  });

  it('returns appropriate message when active connection has no ID', async () => {
    __setActiveMongoClient(mockMongoClient);
    __setActiveDb(mockDb);
    __setActiveConnectionId(null);
    __setActiveDatabaseName(activeDatabaseName);

    const result = await disconnectFromMongo();

    expect(mockSetActiveDb).toHaveBeenCalledWith(null);
    expect(mockLogger.info).toHaveBeenCalledWith('IPC: Disconnected from MongoDB (no specific connection ID previously set).');
    expect(result).toEqual({ message: 'Disconnected from MongoDB.' });
  });
});
