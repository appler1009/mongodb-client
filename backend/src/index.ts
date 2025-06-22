// backend/src/index.ts
import { MongoClient, Db } from 'mongodb';
import { ConnectionService } from './services/ConnectionService';
import { DatabaseService } from './services/DatabaseService';
import pino from 'pino';
import dotenv from 'dotenv';
import { ConnectionConfig, CollectionInfo, DocumentsResponse, ConnectionStatus } from './types'; // Import necessary types

dotenv.config(); // Still load .env for connection strings etc.

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// --- Global state for active MongoDB connection (managed here) ---
let activeMongoClient: MongoClient | null = null;
let activeDb: Db | null = null;
let activeConnectionId: string | null = null;
let activeDatabaseName: string | null = null;

// Initialize services with the logger
const connectionService = new ConnectionService(logger);
const databaseService = new DatabaseService(logger);

// Helper function to disconnect
async function disconnectMongoInternal() {
  if (activeMongoClient) {
    logger.info('Closing existing MongoDB connection...');
    await activeMongoClient.close();
    activeMongoClient = null;
    activeDb = null;
    activeConnectionId = null;
    activeDatabaseName = null;
    databaseService.setActiveDb(null); // Clear active DB in service
    logger.info('MongoDB connection closed.');
  }
}

// --- IPC Handlers (Exposed functions) ---

// Get all saved connections
export const getConnections = async (): Promise<ConnectionConfig[]> => {
  try {
    return await connectionService.getConnections();
  } catch (error: any) {
    logger.error({ error }, 'IPC: Failed to get connections');
    throw new Error(`Failed to retrieve connections: ${error.message}`);
  }
};

// Add a new connection
export const addConnection = async (newConnection: ConnectionConfig): Promise<ConnectionConfig> => {
  try {
    const addedConnection = await connectionService.addConnection(newConnection);
    logger.info({ id: addedConnection.id, name: addedConnection.name }, 'IPC: New connection added');
    return addedConnection;
  } catch (error: any) {
    logger.error({ error, body: newConnection }, 'IPC: Failed to add new connection');
    throw new Error(`Failed to add connection: ${error.message}`);
  }
};

// Update an existing connection
export const updateConnection = async (id: string, updatedConnection: ConnectionConfig): Promise<ConnectionConfig | null> => {
  try {
    const result = await connectionService.updateConnection(id, updatedConnection);
    if (result) {
      if (activeConnectionId === id) {
        await disconnectMongoInternal(); // Disconnect if active connection is updated
        logger.warn(`IPC: Updated active connection ${id}. Disconnected existing connection.`);
      }
      logger.info({ id }, 'IPC: Connection updated');
      return result;
    }
    return null; // Not found
  } catch (error: any) {
    logger.error({ error, id, body: updatedConnection }, 'IPC: Failed to update connection');
    throw new Error(`Failed to update connection: ${error.message}`);
  }
};

// Delete a connection
export const deleteConnection = async (id: string): Promise<boolean> => {
  try {
    const deleted = await connectionService.deleteConnection(id);
    if (deleted) {
      if (activeConnectionId === id) {
        await disconnectMongoInternal(); // Disconnect if active connection is deleted
        logger.warn(`IPC: Deleted active connection ${id}. Disconnected existing connection.`);
      }
      logger.info({ id }, 'IPC: Connection deleted');
      return true;
    }
    return false; // Not found
  } catch (error: any) {
    logger.error({ error, id }, 'IPC: Failed to delete connection');
    throw new Error(`Failed to delete connection: ${error.message}`);
  }
};

// Connect to a MongoDB instance
export const connectToMongo = async (id: string): Promise<ConnectionStatus> => {
  try {
    if (activeMongoClient) {
      await disconnectMongoInternal();
    }

    const connectionConfig = await connectionService.getConnectionById(id);
    if (!connectionConfig) {
      throw new Error('Connection configuration not found.');
    }

    logger.info(`IPC: Attempting to connect to MongoDB using ID: ${id}`);
    const client = new MongoClient(connectionConfig.uri);
    await client.connect();
    activeMongoClient = client;
    activeDb = client.db(connectionConfig.database);
    activeConnectionId = id;
    activeDatabaseName = connectionConfig.database;

    databaseService.setActiveDb(activeDb); // Set active DB in DatabaseService

    logger.info(`IPC: Successfully connected to MongoDB: ${connectionConfig.name}`);
    return {
      message: 'Successfully connected to MongoDB.',
      connectionId: activeConnectionId,
      database: activeDatabaseName
    };
  } catch (error: any) {
    logger.error({ error, connectionId: id }, 'IPC: Failed to connect to MongoDB');
    throw new Error(`Failed to connect to MongoDB: ${error.message}`);
  }
};

// Disconnect from the current MongoDB instance
export const disconnectFromMongo = async (): Promise<ConnectionStatus> => {
  try {
    await disconnectMongoInternal();
    logger.info('IPC: Successfully disconnected from MongoDB.');
    return { message: 'Successfully disconnected from MongoDB.' };
  } catch (error: any) {
    logger.error({ error }, 'IPC: Failed to disconnect from MongoDB');
    throw new Error(`Failed to disconnect from MongoDB: ${error.message}`);
  }
};

// Get collections for the active database
export const getDatabaseCollections = async (): Promise<CollectionInfo[]> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to list collections.');
    }
    return await databaseService.getCollections();
  } catch (error: any) {
    logger.error({ error }, 'IPC: Failed to get collections from active database');
    throw new Error(`Failed to retrieve collections: ${error.message}`);
  }
};

// Get documents from a specific collection in the active database
export const getCollectionDocuments = async (
  collectionName: string,
  limit: number = 20,
  skip: number = 0,
  query: object = {}
): Promise<DocumentsResponse> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to retrieve documents.');
    }
    const documents = await databaseService.getDocuments(collectionName, limit, skip, query);
    const totalDocuments = await databaseService.getDocumentCount(collectionName, query);
    return { documents, totalDocuments };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get documents from collection');
    throw new Error(`Failed to retrieve documents from collection ${collectionName}: ${error.message}`);
  }
};

// Export documents from a collection
export const exportCollectionDocuments = async (collectionName: string, query: object): Promise<string> => { // Returns string (NDJSON)
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to export documents.');
    }
    const documents = await databaseService.getAllDocuments(collectionName, query);
    // Format documents as newline-delimited JSON (NDJSON)
    const ndjsonContent = documents.map(doc => JSON.stringify(doc)).join('\n');
    return ndjsonContent; // Return the NDJSON string
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to export documents from collection');
    throw new Error(`Failed to export documents from collection ${collectionName}: ${error.message}`);
  }
};
