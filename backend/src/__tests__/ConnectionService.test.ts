// src/__tests__/ConnectionService.test.ts
import { ConnectionService } from '../services/ConnectionService';
import pino from 'pino';
import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionConfig, ConnectionsStoreSchema } from '../types';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('electron-store', () => {
  const mockGet = jest.fn();
  const mockSet = jest.fn();
  return jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
  }));
});

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

const mockLogger = jest.requireMock('pino')();
const MockStore = jest.requireMock('electron-store');
const mockUuidv4 = jest.requireMock('uuid').v4;

describe('ConnectionService', () => {
  let connectionService: ConnectionService;
  let mockStoreInstance: Store<ConnectionsStoreSchema>;

  let mockGet: jest.Mock;
  let mockSet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    connectionService = new ConnectionService(mockLogger);
    mockStoreInstance = new MockStore();
    connectionService.setStore(mockStoreInstance);

    mockGet = mockStoreInstance.get as jest.Mock;
    mockSet = mockStoreInstance.set as jest.Mock;

    mockGet.mockReturnValue([]);
  });

  describe('addConnection()', () => {
    it('should add a new connection with a generated ID if none is provided', async () => {
      const newConnection: Partial<ConnectionConfig> = {
        name: 'New Connection',
        uri: 'mongodb://localhost:27017/newdb',
      };
      const generatedId = 'generated-uuid-123';
      mockUuidv4.mockReturnValue(generatedId);

      const expectedConnections: ConnectionConfig[] = [
        { ...newConnection, id: generatedId } as ConnectionConfig
      ];

      const result = await connectionService.addConnection(newConnection as ConnectionConfig);

      expect(mockUuidv4).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ...newConnection, id: generatedId });
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).toHaveBeenCalledWith('connections', expectedConnections);
    });

    it('should add a new connection with a provided ID', async () => {
      const newConnection: ConnectionConfig = {
        id: 'provided-id-456',
        name: 'Another Connection',
        uri: 'mongodb://localhost:27017/anotherdb',
      };

      const expectedConnections: ConnectionConfig[] = [newConnection];

      const result = await connectionService.addConnection(newConnection);

      expect(mockUuidv4).not.toHaveBeenCalled();
      expect(result).toEqual(newConnection);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).toHaveBeenCalledWith('connections', expectedConnections);
    });

    it('should add a new connection to existing connections', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'existing-id-001', name: 'Existing 1', uri: 'mongodb://old1' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const newConnection: ConnectionConfig = {
        id: 'new-id-789',
        name: 'Brand New',
        uri: 'mongodb://brandnew',
      };

      const expectedConnections: ConnectionConfig[] = [...existingConnections, newConnection];

      const result = await connectionService.addConnection(newConnection);

      expect(result).toEqual(newConnection);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).toHaveBeenCalledWith('connections', expectedConnections);
    });

    it('should throw an error if connection name is missing', async () => {
      const newConnection: Partial<ConnectionConfig> = {
        uri: 'mongodb://missingname',
      };

      await expect(connectionService.addConnection(newConnection as ConnectionConfig)).rejects.toThrow(
        'Connection name and URI are required.'
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if connection URI is missing', async () => {
      const newConnection: Partial<ConnectionConfig> = {
        name: 'Missing URI',
      };

      await expect(connectionService.addConnection(newConnection as ConnectionConfig)).rejects.toThrow(
        'Connection name and URI are required.'
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if a connection with the same ID already exists', async () => {
      const existingConnection: ConnectionConfig = {
        id: 'duplicate-id',
        name: 'Duplicate',
        uri: 'mongodb://duplicate',
      };
      mockGet.mockReturnValue([existingConnection]);

      const newConnection: ConnectionConfig = {
        id: 'duplicate-id',
        name: 'New Duplicate Attempt',
        uri: 'mongodb://newduplicate',
      };

      await expect(connectionService.addConnection(newConnection)).rejects.toThrow(
        `Connection with ID ${newConnection.id} already exists.`
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if store is not initialized (addConnection)', async () => {
      const uninitializedService = new ConnectionService(mockLogger);

      const newConnection: ConnectionConfig = {
        id: 'some-id',
        name: 'Test',
        uri: 'mongodb://test',
      };

      await expect(uninitializedService.addConnection(newConnection)).rejects.toThrow(
        'ConnectionService: electron-store not initialized. Call setStore() first.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionService: electron-store not initialized. Call setStore() first.');
    });
  });

  describe('updateConnection()', () => {
    it('should update an existing connection successfully', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Original Name 1', uri: 'mongodb://old1' },
        { id: 'conn2', name: 'Original Name 2', uri: 'mongodb://old2' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const updatedConnection: ConnectionConfig = {
        id: 'conn1',
        name: 'Updated Name 1',
        uri: 'mongodb://updated1',
      };

      const expectedConnections: ConnectionConfig[] = [
        updatedConnection,
        { id: 'conn2', name: 'Original Name 2', uri: 'mongodb://old2' },
      ];

      const result = await connectionService.updateConnection('conn1', updatedConnection);

      expect(result).toEqual(updatedConnection);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).toHaveBeenCalledWith('connections', expectedConnections);
    });

    it('should return undefined if connection to update is not found', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Original Name 1', uri: 'mongodb://old1' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const updatedConnection: ConnectionConfig = {
        id: 'non-existent-id',
        name: 'Attempt Update',
        uri: 'mongodb://attempt',
      };

      const result = await connectionService.updateConnection('non-existent-id', updatedConnection);

      expect(result).toBeUndefined();
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if updated connection name is missing', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Original Name 1', uri: 'mongodb://old1' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const updatedConnection: Partial<ConnectionConfig> = {
        id: 'conn1',
        uri: 'mongodb://updated-missing-name',
      };

      await expect(connectionService.updateConnection('conn1', updatedConnection as ConnectionConfig)).rejects.toThrow(
        'Connection name and URI are required.'
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if updated connection URI is missing', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Original Name 1', uri: 'mongodb://old1' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const updatedConnection: Partial<ConnectionConfig> = {
        id: 'conn1',
        name: 'Updated Missing URI',
      };

      await expect(connectionService.updateConnection('conn1', updatedConnection as ConnectionConfig)).rejects.toThrow(
        'Connection name and URI are required.'
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should throw an error if store is not initialized (updateConnection)', async () => {
      const uninitializedService = new ConnectionService(mockLogger);

      const updatedConnection: ConnectionConfig = {
        id: 'some-id',
        name: 'Test',
        uri: 'mongodb://test',
      };

      await expect(uninitializedService.updateConnection('some-id', updatedConnection)).rejects.toThrow(
        'ConnectionService: electron-store not initialized. Call setStore() first.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionService: electron-store not initialized. Call setStore() first.');
    });
  });

  describe('deleteConnection()', () => {
    it('should delete an existing connection successfully', async () => {
      const connectionToDeleteId = 'conn2';
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
        { id: 'conn2', name: 'Conn 2', uri: 'mongodb://conn2' },
        { id: 'conn3', name: 'Conn 3', uri: 'mongodb://conn3' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const expectedConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
        { id: 'conn3', name: 'Conn 3', uri: 'mongodb://conn3' },
      ];

      const result = await connectionService.deleteConnection(connectionToDeleteId);

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).toHaveBeenCalledWith('connections', expectedConnections);
    });

    it('should return false if connection to delete is not found', async () => {
      const existingConnections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
      ];
      mockGet.mockReturnValue(existingConnections);

      const nonExistentId = 'non-existent-id';
      const result = await connectionService.deleteConnection(nonExistentId);

      expect(result).toBe(false);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
      expect(mockSet).not.toHaveBeenCalled(); // No write operation if nothing was deleted
    });

    it('should throw an error if store is not initialized (deleteConnection)', async () => {
      const uninitializedService = new ConnectionService(mockLogger);

      await expect(uninitializedService.deleteConnection('some-id')).rejects.toThrow(
        'ConnectionService: electron-store not initialized. Call setStore() first.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionService: electron-store not initialized. Call setStore() first.');
    });
  });

  describe('getConnections()', () => {
    it('should return all connections from the store', async () => {
      const connections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
        { id: 'conn2', name: 'Conn 2', uri: 'mongodb://conn2' },
      ];
      mockGet.mockReturnValue(connections);

      const result = await connectionService.getConnections();

      expect(result).toEqual(connections);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
    });

    it('should return empty array if no connections exist', async () => {
      mockGet.mockReturnValue([]);

      const result = await connectionService.getConnections();

      expect(result).toEqual([]);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
    });

    it('should throw an error if store is not initialized (getConnections)', async () => {
      const uninitializedService = new ConnectionService(mockLogger);

      await expect(uninitializedService.getConnections()).rejects.toThrow(
        'ConnectionService: electron-store not initialized. Call setStore() first.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionService: electron-store not initialized. Call setStore() first.');
    });
  });

  describe('getConnectionById()', () => {
    it('should return the connection with the specified ID', async () => {
      const connections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
        { id: 'conn2', name: 'Conn 2', uri: 'mongodb://conn2' },
      ];
      mockGet.mockReturnValue(connections);

      const result = await connectionService.getConnectionById('conn2');

      expect(result).toEqual(connections[1]);
      expect(mockGet).toHaveBeenCalledWith('connections', []);
    });

    it('should return undefined if connection with ID is not found', async () => {
      const connections: ConnectionConfig[] = [
        { id: 'conn1', name: 'Conn 1', uri: 'mongodb://conn1' },
      ];
      mockGet.mockReturnValue(connections);

      const result = await connectionService.getConnectionById('non-existent-id');

      expect(result).toBeUndefined();
      expect(mockGet).toHaveBeenCalledWith('connections', []);
    });

    it('should throw an error if store is not initialized (getConnectionById)', async () => {
      const uninitializedService = new ConnectionService(mockLogger);

      await expect(uninitializedService.getConnectionById('some-id')).rejects.toThrow(
        'ConnectionService: electron-store not initialized. Call setStore() first.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionService: electron-store not initialized. Call setStore() first.');
    });
  });

  describe('setStore()', () => {
    it('should set the store instance and log debug message', () => {
      const newStore = new MockStore();
      connectionService.setStore(newStore);

      expect(mockLogger.debug).toHaveBeenCalledWith('ConnectionService: electron-store instance injected.');
    });
  });
});
