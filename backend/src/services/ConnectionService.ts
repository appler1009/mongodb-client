// backend/src/services/ConnectionService.ts
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { Logger } from 'pino';
import { ConnectionConfig } from '../types'; // We'll create this type
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

export class ConnectionService {
  private connectionsFilePath: string;
  private logger: Logger;

  constructor(logger: Logger) {
    this.connectionsFilePath = resolve(__dirname, '../../connections.json'); // Path from dist/services/ to connections.json
    this.logger = logger;
    this.ensureConnectionsFileExists(); // Ensure the file is there on startup
  }

  private async ensureConnectionsFileExists() {
    try {
      await readFile(this.connectionsFilePath, { encoding: 'utf8' });
      this.logger.info(`Connections file exists: ${this.connectionsFilePath}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.warn(`Connections file not found, creating an empty one at: ${this.connectionsFilePath}`);
        await writeFile(this.connectionsFilePath, JSON.stringify([]), { encoding: 'utf8' });
      } else {
        this.logger.error({ error }, `Error checking connections file: ${this.connectionsFilePath}`);
      }
    }
  }

  private async readConnections(): Promise<ConnectionConfig[]> {
    try {
      const data = await readFile(this.connectionsFilePath, { encoding: 'utf8' });
      return JSON.parse(data) as ConnectionConfig[];
    } catch (error) {
      this.logger.error({ error }, 'Failed to read connections.json');
      return []; // Return empty array on read error
    }
  }

  private async writeConnections(connections: ConnectionConfig[]): Promise<void> {
    try {
      await writeFile(this.connectionsFilePath, JSON.stringify(connections, null, 2), { encoding: 'utf8' });
    } catch (error: any) {
      this.logger.error({ error }, 'Failed to write to connections.json');
      throw new Error(`Failed to save connection data: ${error.message}`);
    }
  }

  async getConnections(): Promise<ConnectionConfig[]> {
    return this.readConnections();
  }

  async getConnectionById(id: string): Promise<ConnectionConfig | undefined> {
    const connections = await this.readConnections();
    return connections.find(conn => conn.id === id);
  }

  async addConnection(newConnection: ConnectionConfig): Promise<ConnectionConfig> {
    const connections = await this.readConnections();
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
    await this.writeConnections(connections);
    return newConnection;
  }

  async updateConnection(id: string, updatedConnection: ConnectionConfig): Promise<ConnectionConfig | undefined> {
    const connections = await this.readConnections();
    const index = connections.findIndex(conn => conn.id === id);

    if (index !== -1) {
      // Ensure the ID in the body matches the path ID
      updatedConnection.id = id;
      // Basic validation: Only name and URI are required, as database/user/pass are now part of URI
      if (!updatedConnection.name || !updatedConnection.uri) {
          throw new Error('Connection name and URI are required.');
      }
      connections[index] = updatedConnection;
      await this.writeConnections(connections);
      return updatedConnection;
    }
    return undefined; // Not found
  }

  async deleteConnection(id: string): Promise<boolean> {
    const connections = await this.readConnections();
    const initialLength = connections.length;
    const filteredConnections = connections.filter(conn => conn.id !== id);

    if (filteredConnections.length < initialLength) {
      await this.writeConnections(filteredConnections);
      return true; // Deleted
    }
    return false; // Not found
  }
}
