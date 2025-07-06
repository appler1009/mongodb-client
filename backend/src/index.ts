// backend/src/index.ts
import { connectWithDriverFallback, MongoClient, Db, ObjectId, UniversalMongoClientOptions } from './services/mongoDriverChooser';
import { ConnectionService } from './services/ConnectionService';
import { DatabaseService } from './services/DatabaseService';
import pino from 'pino';
import dotenv from 'dotenv';
import { ConnectionConfig, CollectionInfo, DocumentsResponse, ConnectionStatus, Document, MongoQueryParams } from './types';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { default as Store } from 'electron-store';

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
let activeDatabaseName: string | undefined = undefined;
let activeDriverVersion: string | null = null;

// Initialize services.
// ConnectionService now takes the logger and will later receive the store.
const connectionService = new ConnectionService(logger);
const databaseService = new DatabaseService(logger);

// --- Initialization function for the backend ---
// This function will be called from main.js and injects the connectionsStore
export function initialize(connectionsStore: Store<any>) {
  if (!connectionsStore) {
    logger.error('Connections store was not provided during backend initialization.');
    throw new Error('Connections store is required for backend operations.');
  }
  // Pass the connectionsStore instance to the ConnectionService
  connectionService.setStore(connectionsStore);
  logger.info('Backend: ConnectionService initialized with electron-store.');

  // Return all exported functions so main.js can access them
  return {
    getConnections,
    addConnection,
    updateConnection,
    deleteConnection,
    connectToMongo,
    disconnectFromMongo,
    getDatabaseCollections,
    getCollectionDocuments,
    exportCollectionDocuments,
    getCollectionSchemaAndSampleDocuments,
    generateAIQuery,
  };
}


// Helper function to disconnect
async function disconnectMongoInternal() {
  if (activeMongoClient) {
    logger.info('Closing existing MongoDB connection...');
    await activeMongoClient.close();
    activeMongoClient = null;
    activeDb = null;
    activeConnectionId = null;
    activeDatabaseName = undefined;
    activeDriverVersion = null;
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

      // Prioritize checking for the _bsontype property for robustness
      if (value && typeof value === 'object' && value._bsontype === 'ObjectID') {
        newDoc[key] = value.toHexString(); // Convert to hex string
      }
      // Keep the instanceof check as a fallback or for consistency,
      // although the _bsontype check is more reliable in this scenario.
      else if (value instanceof ObjectId) {
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
    logger.debug(`IPC: Connection details: ${id} ${JSON.stringify(connectionConfig)}`);
    const options: UniversalMongoClientOptions = {
      connectTimeoutMS: 5000,
    };
    const { client, driverVersion } = await connectWithDriverFallback(connectionConfig.uri, options, connectionConfig.driverVersion);

    await client.connect(); // Connects to the MongoDB server

    let dbNameFromUri: string | undefined;
    try {
      const uriObj = new URL(connectionConfig.uri);
      if (uriObj.pathname && uriObj.pathname.length > 1) {
        dbNameFromUri = uriObj.pathname.substring(1);
      }
    } catch (e) {
      logger.warn({ uri: connectionConfig.uri, error: e }, 'Failed to parse URI to extract database name. This might be normal if URI doesn\'t specify a database path.');
    }

    if (!dbNameFromUri) {
      dbNameFromUri = client.db().databaseName;
      logger.info(`No explicit database name found in URI path. Connected to database: '${dbNameFromUri}'.`);
    }

    activeMongoClient = client;
    activeDb = client.db(dbNameFromUri);
    activeConnectionId = id;
    activeDatabaseName = dbNameFromUri;
    activeDriverVersion = driverVersion;

    // Update the connection config with the driver version
    if (connectionConfig && driverVersion) {
      const updatedConnection: ConnectionConfig = {
        ...connectionConfig,
        driverVersion: driverVersion,
      };
      await connectionService.updateConnection(id, updatedConnection);
      logger.info(`IPC: Stored driver version ${driverVersion} for connection ${id}`);
    }

    databaseService.setActiveDb(activeDb); // Set active DB in DatabaseService

    logger.info(`IPC: Successfully connected to MongoDB: ${connectionConfig.name} on database: ${activeDatabaseName} with driver ${activeDriverVersion}`);
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
  params: MongoQueryParams = {}
): Promise<DocumentsResponse> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to retrieve documents.');
    }
    const documents = await databaseService.getDocuments(collectionName, limit, skip, params);
    const { query = {}, filter = {} } = params;
    const totalDocuments = await databaseService.getDocumentCount(collectionName, { ...query, ...filter });

    // Apply the transformation before sending documents to the renderer
    const transformedDocuments = documents.map(prepareDocumentForFrontend);

    return { documents: transformedDocuments, totalDocuments };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get documents from collection');
    throw new Error(`Failed to retrieve documents from collection ${collectionName}: ${error.message}`);
  }
};

// Export documents from a collection
export const exportCollectionDocuments = async (collectionName: string, params: MongoQueryParams = {}): Promise<string> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to export documents.');
    }
    const documents = await databaseService.getAllDocuments(collectionName, params);

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


// --- Query Helper Functions ---

/**
 * Fetches sample documents and schema summary for a given collection.
 * This is used to provide context to the Query Helper model.
 * @param {string} collectionName - The name of the collection.
 * @param {number} sampleCount - The number of sample documents to fetch.
 * @returns {Promise<{ sampleDocuments: Document[]; schemaSummary: string }>} Sample documents and schema summary.
 */
export const getCollectionSchemaAndSampleDocuments = async (
  collectionName: string,
  sampleCount: number = 2
): Promise<{ sampleDocuments: Document[]; schemaSummary: string }> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to get schema and samples.');
    }
    const { sampleDocuments, schemaSummary } = await databaseService.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);
    // Ensure sample documents are prepared for frontend if they contain special BSON types
    const transformedSampleDocuments = sampleDocuments.map(prepareDocumentForFrontend);
    logger.info({ collectionName, sampleCount, schemaSummaryLength: schemaSummary.length }, 'IPC: Fetched schema and sample documents for Query Helper.');
    return { sampleDocuments: transformedSampleDocuments, schemaSummary };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get schema and sample documents for Query Helper');
    throw new Error(`Failed to get schema and sample documents for Query Helper: ${error.message}`);
  }
};

/**
 * Generates a MongoDB query using the Grok-3-mini model based on a natural language prompt.
 * @param {string} userPrompt - The natural language request from the user.
 * @param {string} collectionName - The name of the collection for context.
 * @param {string} schemaSummary - A summary of the collection's schema.
 * @param {Document[]} sampleDocuments - A few sample documents from the collection.
 * @returns {Promise<{ generatedQuery?: string; error?: string }>} The generated MongoQueryParams JSON or an error.
 */
export const generateAIQuery = async (
  userPrompt: string,
  collectionName: string,
  schemaSummary: string,
  sampleDocuments: Document[]
): Promise<{ generatedQuery?: string; error?: string }> => {
  try {
    const grokModel = "grok-3-mini";
    const apiUrl = `https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions`;

    const formattedSampleDocs = JSON.stringify(sampleDocuments, null, 2);

    const systemInstruction = `As an expert MongoDB query generator, convert natural language descriptions into a valid MongoDB query parameters JSON object conforming to the following structure:
{
  "query"?: object, // MongoDB find query (e.g., {"age": {"$gt": 30}})
  "sort"?: object, // Sort specification (e.g., {"name": 1} or {"name": "asc"})
  "filter"?: object, // Additional filter for find query
  "pipeline"?: object[], // Aggregation pipeline stages (e.g., [{"$match": {...}}, {"$group": {...}}])
  "projection"?: object, // Fields to include/exclude (e.g., {"name": 1, "_id": 0})
  "collation"?: object, // Collation options (e.g., {"locale": "en", "strength": 2})
  "hint"?: object | string, // Index hint (e.g., {"name": 1} or "indexName")
  "readPreference"?: string // Read preference (e.g., "primary", "secondary")
}
- Include only the fields relevant to the user's prompt.
- For simple queries, use "query" for MongoDB find operations.
- Use "pipeline" only for explicit aggregation requests (e.g., grouping, joining).
- Ensure "sort" values are 1, -1, "asc", or "desc".
- Ensure "collation" includes a "locale" property if specified.
- Ensure "readPreference" is one of: "primary", "primaryPreferred", "secondary", "secondaryPreferred", "nearest".
Respond ONLY with the raw JSON object. Do not include any other text, explanations, or markdown fences.`;

    const prompt = `Given the following MongoDB collection information:

Collection Name: "${collectionName}"

${schemaSummary}

Document Examples (first ${sampleDocuments.length} documents):
\`\`\`json
${formattedSampleDocs}
\`\`\`

Based on this context, generate a MongoDB query parameters JSON object for the following natural language request:

"${userPrompt}"`;

    // Construct the messages array for x.ai chat completions API
    const messages = [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt }
    ];

    const payload = {
      messages: messages,
      model: grokModel,
      stream: false,
      temperature: 0,
      max_tokens: 5000,
    };

    logger.info({ collectionName, userPromptLength: userPrompt.length, sampleDocCount: sampleDocuments.length, model: payload.model },
      `Sending request to Query Helper (${grokModel})...`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'identity',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error({ status: response.status, errorData }, 'Query Helper API Error Response');
      return { error: `Query Helper API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}` };
    }

    const result = await response.json();
    // The chat completions API returns choices[0].message.content
    if (result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
      const generatedText = result.choices[0].message.content;
      logger.info({ generatedTextLength: generatedText.length, generatedText }, `Query Helper (${grokModel}) returned a response.`);

      try {
        JSON.parse(generatedText); // Parse to validate JSON syntax
        return { generatedQuery: generatedText }; // Return raw JSON string without validation
      } catch (parseError: unknown) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error parsing JSON';
        logger.error({ parseError: errorMessage, generatedText }, 'Failed to parse Query Helper generated JSON');
        return { error: 'Query Helper generated invalid JSON. Please try again with a clearer prompt.' };
      }
    } else {
      logger.warn({ result }, `Query Helper (${grokModel}) did not return a valid response structure.`);
      return { error: `Query Helper did not return a valid response structure.` };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during Query Helper generation';
    logger.error({ error: errorMessage }, `Error during Query Helper generation`);
    return { error: `Internal error during Query Helper generation: ${errorMessage}` };
  }
};
