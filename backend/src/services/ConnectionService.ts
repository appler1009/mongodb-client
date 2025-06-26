// backend/src/services/ConnectionService.ts
import { Logger } from 'pino';
import { ConnectionConfig, ConnectionsStoreSchema } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { default as Store } from 'electron-store';

export class ConnectionService {
  private logger: Logger;
  private connectionsStore: Store<ConnectionsStoreSchema> | undefined;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // Method to set the electron-store instance, called from index.ts
  public setStore(store: Store<ConnectionsStoreSchema>): void {
    this.connectionsStore = store;
    this.logger.info('ConnectionService: electron-store instance injected.');
  }

  // Helper to ensure the store is available before operations
  private ensureStoreInitialized(): Store<ConnectionsStoreSchema> {
    if (!this.connectionsStore) {
      const errorMsg = 'ConnectionService: electron-store not initialized. Call setStore() first.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    return this.connectionsStore;
  }

  // Refactored to use electron-store
  private readConnections(): ConnectionConfig[] {
    const store = this.ensureStoreInitialized();
    // 'connections' is the key under which the array of connections is stored in electron-store
    return store.get('connections', []); // Default to empty array if key doesn't exist
  }

  // Refactored to use electron-store
  private writeConnections(connections: ConnectionConfig[]): void {
    const store = this.ensureStoreInitialized();
    store.set('connections', connections);
    this.logger.info('Connections data written to electron-store.');
  }

  async getConnections(): Promise<ConnectionConfig[]> {
    return this.readConnections();
  }

  async getConnectionById(id: string): Promise<ConnectionConfig | undefined> {
    const connections = this.readConnections();
    return connections.find(conn => conn.id === id);
  }

  async addConnection(newConnection: ConnectionConfig): Promise<ConnectionConfig> {
    const connections = this.readConnections();
    if (!newConnection.id) {
      newConnection.id = uuidv4(); // Assign a unique ID
    }
    // Basic validation: Only name and URI are required, as database/user/pass are now part of URI
    if (!newConnection.name || !newConnection.uri) {
      throw new Error('Connection name and URI are required.');
    }
    if (connections.some(conn => conn.id === newConnection.id)) {
      throw new Error(`Connection with ID ${newConnection.id} already exists.`);
    }

    connections.push(newConnection);
    this.writeConnections(connections);
    return newConnection;
  }

  async updateConnection(id: string, updatedConnection: ConnectionConfig): Promise<ConnectionConfig | undefined> {
    const connections = this.readConnections();
    const index = connections.findIndex(conn => conn.id === id);

    if (index !== -1) {
      // Ensure the ID in the body matches the path ID
      updatedConnection.id = id;
      // Basic validation: Only name and URI are required
      if (!updatedConnection.name || !updatedConnection.uri) {
        throw new Error('Connection name and URI are required.');
      }
      connections[index] = updatedConnection;
      this.writeConnections(connections);
      return updatedConnection;
    }
    return undefined; // Not found
  }

  async deleteConnection(id: string): Promise<boolean> {
    const connections = this.readConnections();
    const initialLength = connections.length;
    const filteredConnections = connections.filter(conn => conn.id !== id);

    if (filteredConnections.length < initialLength) {
      this.writeConnections(filteredConnections);
      return true; // Deleted
    }
    return false; // Not found
  }
}
