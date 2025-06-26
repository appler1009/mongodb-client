// backend/src/index.ts
import { MongoClient, Db, ObjectId } from 'mongodb';
import { ConnectionService } from './services/ConnectionService';
import { DatabaseService } from './services/DatabaseService';
import pino from 'pino';
import dotenv from 'dotenv';
import { ConnectionConfig, CollectionInfo, DocumentsResponse, ConnectionStatus } from './types';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

// --- Helper: Prepare documents for frontend serialization ---
// This function recursively converts MongoDB-specific types (like ObjectId)
// into standard JavaScript types or strings that JSON.stringify can handle gracefully.
const prepareDocumentForFrontend = (doc: any): any => {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  // Handle arrays recursively
  if (Array.isArray(doc)) {
    return doc.map(item => prepareDocumentForFrontend(item));
  }

  const newDoc: { [key: string]: any } = {};
  for (const key in doc) {
    if (Object.prototype.hasOwnProperty.call(doc, key)) {
      const value = doc[key];

      // Convert ObjectId instances to their hexadecimal string
      if (value instanceof ObjectId) {
        newDoc[key] = value.toHexString();
      }
      // Date objects are generally handled well by JSON.stringify to ISO strings,
      // but you can explicitly convert if you need different formatting or control.
      else if (value instanceof Date) {
        newDoc[key] = value.toISOString();
      }
      // Recursively process nested objects
      else if (typeof value === 'object' && value !== null) {
        newDoc[key] = prepareDocumentForFrontend(value);
      }
      // Keep other primitive values as they are
      else {
        newDoc[key] = value;
      }
    }
  }
  return newDoc;
};

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
    await client.connect(); // Connects to the MongoDB server

    let dbNameFromUri: string | undefined;
    try {
        // Parse the URI to extract the database name from the path component
        const uriObj = new URL(connectionConfig.uri);
        // Pathname starts with a '/', so we slice it off.
        // Example: mongodb://localhost:27017/myDatabase -> pathname: /myDatabase -> dbNameFromUri: myDatabase
        if (uriObj.pathname && uriObj.pathname.length > 1) {
            dbNameFromUri = uriObj.pathname.substring(1);
        }
    } catch (e) {
        logger.warn({ uri: connectionConfig.uri, error: e }, 'Failed to parse URI to extract database name. This might be normal if URI doesn\'t specify a database path.');
    }

    if (!dbNameFromUri) {
        // If the URI does not contain a database name in its path,
        // you must explicitly select a database using client.db('dbName').
        // A common default is 'admin' or you could mandate the URI specifies it.
        // For this application, let's assume if not explicitly in URI path,
        // the user expects to connect to 'admin' or the default database the driver selects.
        // The MongoDB driver's `client.db()` without an argument will connect to the database specified in the URI,
        // or fall back to 'admin' if none is specified or the URI is invalid.
        // To be explicit, we can try to get the database name from the client after connection.
        dbNameFromUri = client.db().databaseName; // Get the default database name from the connected client
        logger.info(`No explicit database name found in URI path. Connected to database: '${dbNameFromUri}'.`);
    }

    activeMongoClient = client;
    activeDb = client.db(dbNameFromUri); // Use the extracted/derived database name
    activeConnectionId = id;
    activeDatabaseName = dbNameFromUri; // Store the actual database name connected to

    databaseService.setActiveDb(activeDb); // Set active DB in DatabaseService

    logger.info(`IPC: Successfully connected to MongoDB: ${connectionConfig.name} on database: ${activeDatabaseName}`);
    return {
      message: 'Successfully connected to MongoDB.',
      connectionId: activeConnectionId,
      database: activeDatabaseName
    };
  } catch (error: any) {
    logger.error({ error, connectionId: id }, 'IPC: Failed to connect to MongoDB');
    // Ensure the connection is fully reset if an error occurs during connection
    await disconnectMongoInternal();
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

    // Apply the transformation before sending documents to the renderer
    const transformedDocuments = documents.map(prepareDocumentForFrontend);

    return { documents: transformedDocuments, totalDocuments };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get documents from collection');
    throw new Error(`Failed to retrieve documents from collection ${collectionName}: ${error.message}`);
  }
};

// Export documents from a collection
export const exportCollectionDocuments = async (collectionName: string, query: object): Promise<string> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to export documents.');
    }
    const documents = await databaseService.getAllDocuments(collectionName, query);

    // Apply the transformation before stringifying for NDJSON export
    const transformedDocuments = documents.map(prepareDocumentForFrontend);

    // Format documents as newline-delimited JSON (NDJSON)
    const ndjsonContent = transformedDocuments.map(doc => JSON.stringify(doc)).join('\n');

    // --- Store content into a temporary file ---
    const tempDir = os.tmpdir(); // Get the system's temporary directory
    // Generate a unique filename to avoid conflicts
    const tempFileName = `export_${collectionName}_${uuidv4()}.jsonl`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, ndjsonContent, { encoding: 'utf8' });
    logger.info(`Exported NDJSON content to temporary file: ${tempFilePath}`);

    return tempFilePath; // Return the path to the temporary file
  } catch (error: any) {
    logger.error({ error, collectionName }, 'Backend: Failed to export documents to temp file');
    // Ensure the error message sent back is clear and actionable
    throw new Error(`Failed to export documents to temporary file for collection ${collectionName}: ${error.message}`);
  }
};
