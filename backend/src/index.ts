import { connectWithDriverFallback, MongoClient, Db, ObjectId, UniversalMongoClientOptions, FindCursor, AggregationCursor } from './services/mongoDriverChooser';
import { ConnectionService } from './services/ConnectionService';
import { DatabaseService } from './services/DatabaseService';
import pino from 'pino';
import dotenv from 'dotenv';
import { ConnectionConfig, CollectionInfo, DocumentsResponse, ConnectionStatus, Document, MongoQueryParams, SchemaMap } from './types';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { default as Store } from 'electron-store';

// Map to store active connection attempts for cancellation
const connectionAttempts = new Map<string, { controller: AbortController, cleanup?: () => Promise<void> }>();

dotenv.config();

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

// Initialize services
const connectionService = new ConnectionService(logger);
const databaseService = new DatabaseService(logger);

// --- Initialization function for the backend ---
export function initialize(connectionsStore: Store<any>) {
  if (!connectionsStore) {
    logger.error('Connections store was not provided during backend initialization.');
    throw new Error('Connections store is required for backend operations.');
  }
  connectionService.setStore(connectionsStore);
  logger.debug('Backend: ConnectionService initialized with electron-store.');

  return {
    getConnections,
    addConnection,
    updateConnection,
    deleteConnection,
    connectToMongo,
    disconnectFromMongo,
    cancelConnectionAttempt,
    getDatabaseCollections,
    getCollectionDocuments,
    exportCollectionDocuments,
    getCollectionDocumentCounts,
    getCollectionSchemaAndSampleDocuments,
    generateAIQuery,
  };
}

// Helper function to disconnect
async function disconnectMongoInternal() {
  if (activeMongoClient) {
    logger.debug('Closing existing MongoDB connection...');
    await activeMongoClient.close();
    activeMongoClient = null;
    activeDb = null;
    activeConnectionId = null;
    activeDatabaseName = undefined;
    activeDriverVersion = null;
    databaseService.setActiveDb(null);
    logger.debug('MongoDB connection closed.');
  }
}

// --- Helper: Prepare documents for frontend serialization ---
const prepareDocumentForFrontend = (doc: any): any => {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map(item => prepareDocumentForFrontend(item));
  }

  const newDoc: { [key: string]: any } = {};
  for (const key in doc) {
    if (Object.prototype.hasOwnProperty.call(doc, key)) {
      const value = doc[key];

      if (value && typeof value === 'object' && value._bsontype === 'ObjectID') {
        newDoc[key] = value.toHexString();
      }
      else if (value instanceof ObjectId) {
        newDoc[key] = value.toHexString();
      }
      else if (value instanceof Date) {
        newDoc[key] = value.toISOString();
      }
      else if (typeof value === 'object' && value !== null) {
        newDoc[key] = prepareDocumentForFrontend(value);
      }
      else {
        newDoc[key] = value;
      }
    }
  }
  return newDoc;
};

// --- IPC Handlers (Exposed functions) ---

export const getConnections = async (): Promise<ConnectionConfig[]> => {
  try {
    return await connectionService.getConnections();
  } catch (error: any) {
    logger.error({ error }, 'IPC: Failed to get connections');
    throw new Error(`Failed to retrieve connections: ${error.message}`);
  }
};

export const addConnection = async (newConnection: ConnectionConfig): Promise<ConnectionConfig> => {
  try {
    const addedConnection = await connectionService.addConnection(newConnection);
    logger.debug({ id: addedConnection.id, name: addedConnection.name }, 'IPC: New connection added');
    return addedConnection;
  } catch (error: any) {
    logger.error({ error, body: newConnection }, 'IPC: Failed to add new connection');
    throw new Error(`Failed to add connection: ${error.message}`);
  }
};

export const updateConnection = async (id: string, updatedConnection: ConnectionConfig): Promise<ConnectionConfig | null> => {
  try {
    const result = await connectionService.updateConnection(id, updatedConnection);
    if (result) {
      if (activeConnectionId === id) {
        await disconnectMongoInternal();
        logger.warn(`IPC: Updated active connection ${id}. Disconnected existing connection.`);
      }
      logger.debug({ id }, 'IPC: Connection updated');
      return result;
    }
    return null;
  } catch (error: any) {
    logger.error({ error, id, body: updatedConnection }, 'IPC: Failed to update connection');
    throw new Error(`Failed to update connection: ${error.message}`);
  }
};

export const deleteConnection = async (id: string): Promise<boolean> => {
  try {
    const deleted = await connectionService.deleteConnection(id);
    if (deleted) {
      if (activeConnectionId === id) {
        await disconnectMongoInternal();
        logger.warn(`IPC: Deleted active connection ${id}. Disconnected existing connection.`);
      }
      logger.debug({ id }, 'IPC: Connection deleted');
      return true;
    }
    return false;
  } catch (error: any) {
    logger.error({ error, id }, 'IPC: Failed to delete connection');
    throw new Error(`Failed to delete connection: ${error.message}`);
  }
};

export const connectToMongo = async (connectionId: string, attemptId: string): Promise<ConnectionStatus> => {
  try {
    if (activeMongoClient) {
      await disconnectMongoInternal();
    }

    const connectionConfig = await connectionService.getConnectionById(connectionId);
    if (!connectionConfig) {
      throw new Error('Connection configuration not found.');
    }

    logger.debug(`IPC: Attempting to connect to MongoDB using ID: ${connectionId}`);
    logger.debug(`IPC: Connection details: ${connectionId} ${JSON.stringify(connectionConfig)}`);

    // Generate a unique attempt ID for cancellation tracking
    const controller = new AbortController();

    // Store the controller for possible cancellation
    connectionAttempts.set(attemptId, { controller });

    const options: UniversalMongoClientOptions = {
      connectTimeoutMS: 5000,
    };
    let client: MongoClient;
    let driverVersion: 'v6' | 'v5' | 'v4' | 'v3';
    try {
      const result = await connectWithDriverFallback(
        connectionConfig.uri,
        logger,
        options,
        connectionConfig.driverVersion,
        controller.signal
      );
      client = result.client;
      driverVersion = result.driverVersion;

      await client.connect();
      // Store cleanup function in case connection is aborted later
      connectionAttempts.get(attemptId)!.cleanup = async () => {
        try {
          if (client) await client.close();
        } catch (err) {
          logger.error('Error closing client during cleanup', err);
        }
      };
    } catch (error: unknown) {
      // Clean up on failure
      connectionAttempts.delete(attemptId);
      // Check if it was an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug(`Connection attempt ${attemptId} aborted by user.`);
        throw new Error(`Connection attempt aborted for ID: ${connectionId}`);
      }
      // Regular error handling
      if (error instanceof Error) {
        logger.error(`Error connecting to MongoDB for ID ${connectionId}:`, error);
      } else {
        logger.error(`Error connecting to MongoDB for ID ${connectionId}: Unknown error`);
      }
      throw error;
    } finally {
      // Ensure cleanup if needed, though this is mostly handled in success or error paths
      if (connectionAttempts.has(attemptId) && !connectionAttempts.get(attemptId)!.cleanup) {
        connectionAttempts.delete(attemptId);
      }
    }

    // On success, clean up the attempt entry
    connectionAttempts.delete(attemptId);
    logger.debug(`Attempt ID ${attemptId} deleted`);

    let dbNameFromUri: string | undefined;
    try {
      const uriObj = new URL(connectionConfig.uri);
      if (uriObj.pathname && uriObj.pathname.length > 1) {
        dbNameFromUri = uriObj.pathname.substring(1);
      }
    } catch (e) {
      logger.warn({ uri: connectionConfig.uri, error: e }, 'Failed to parse URI to extract database name.');
    }

    if (!dbNameFromUri) {
      dbNameFromUri = client.db().databaseName;
      logger.debug(`No explicit database name found in URI path. Connected to database: '${dbNameFromUri}'.`);
    }

    activeMongoClient = client;
    activeDb = client.db(dbNameFromUri);
    activeConnectionId = connectionId;
    activeDatabaseName = dbNameFromUri;
    activeDriverVersion = driverVersion;

    if (connectionConfig && driverVersion) {
      const updatedConnection: ConnectionConfig = {
        ...connectionConfig,
        driverVersion: driverVersion,
      };
      await connectionService.updateConnection(connectionId, updatedConnection);
      logger.debug(`IPC: Stored driver version ${driverVersion} for connection ${connectionId}`);
    }

    databaseService.setActiveDb(activeDb);

    logger.debug(`IPC: Successfully connected to MongoDB: ${connectionConfig.name} on database: ${activeDatabaseName} with driver ${activeDriverVersion}`);
    return {
      name: connectionConfig.name,
      message: 'Successfully connected to MongoDB.',
      connectionId: activeConnectionId,
      database: activeDatabaseName
    };
  } catch (error: any) {
    logger.error({ error, connectionId }, 'IPC: Failed to connect to MongoDB');
    await disconnectMongoInternal();
    throw new Error(`Failed to connect to MongoDB: ${error.message}`);
  }
};

export const disconnectFromMongo = async (): Promise<ConnectionStatus> => {
  try {
    await disconnectMongoInternal();
    logger.debug('IPC: Successfully disconnected from MongoDB.');
    return { message: 'Successfully disconnected from MongoDB.' };
  } catch (error: any) {
    logger.error({ error }, 'IPC: Failed to disconnect from MongoDB');
    throw new Error(`Failed to disconnect from MongoDB: ${error.message}`);
  }
};

// Function to cancel a connection attempt
export const cancelConnectionAttempt = async (attemptId: string): Promise<{ success: boolean; message: string }> => {
  logger.debug(`Received cancellation request for attempt ID: ${attemptId}`);
  const attempt = connectionAttempts.get(attemptId);
  if (!attempt) {
    return { success: false, message: 'No matching connection attempt found' };
  }

  // Abort the controller
  logger.debug(`Calling abort for attempt ID: ${attemptId}`);
  attempt.controller.abort();

  // Run any cleanup if needed (e.g., close an established connection)
  logger.debug(`Calling cleanup for attempt ID: ${attemptId}`);
  if (attempt.cleanup) {
    await attempt.cleanup();
  }

  // Clean up
  connectionAttempts.delete(attemptId);
  return { success: true, message: 'Connection attempt cancelled' };
};

export const getDatabaseCollections = async (): Promise<CollectionInfo[]> => {
  logger.debug('IPC: getDatabaseCollections called');
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
    logger.debug(`Retrieved ${documents.length} documents from collection ${collectionName}`);
    logger.debug(JSON.stringify(documents));
    const totalDocuments = await databaseService.getDocumentCount(collectionName, params);

    const transformedDocuments = documents.map(prepareDocumentForFrontend);
    logger.debug(`Transformed ${transformedDocuments.length} documents`);
    logger.debug(JSON.stringify(transformedDocuments));

    return { documents: transformedDocuments, totalDocuments };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get documents from collection');
    throw new Error(`Failed to retrieve documents from collection ${collectionName}: ${error.message}`);
  }
};

export const exportCollectionDocuments = async (collectionName: string, params: MongoQueryParams = {}): Promise<string> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to export documents.');
    }
    const documents = await databaseService.getAllDocuments(collectionName, params);

    const transformedDocuments = documents.map(prepareDocumentForFrontend);
    const ndjsonContent = transformedDocuments.map(doc => JSON.stringify(doc)).join('\n');

    const tempDir = os.tmpdir();
    const tempFileName = `export_${collectionName}_${uuidv4()}.jsonl`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, ndjsonContent, { encoding: 'utf8' });
    logger.debug(`Exported NDJSON content to temporary file: ${tempFilePath}`);

    return tempFilePath;
  } catch (error: any) {
    logger.error({ error, collectionName }, 'Backend: Failed to export documents to temp file');
    throw new Error(`Failed to export documents to temporary file for collection ${collectionName}: ${error.message}`);
  }
};

export const getCollectionDocumentCounts = async (collectionName: string): Promise<number> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to get document counts.');
    }
    const count = await databaseService.getDocumentCount(collectionName);
    logger.debug({ collectionName, count }, 'Backend: Fetched document count for collection');
    return count;
  } catch (error: any) {
    logger.error({ error, collectionName }, 'Backend: Failed to fetch document count for collection');
    throw new Error(`Failed to fetch document count for collection ${collectionName}: ${error.message}`);
  }
};

/**
 * Fetches sample documents and schema map for a given collection.
 * This is used to provide context to the Query Helper model.
 * @param collectionName The name of the collection.
 * @param sampleCount The number of sample documents to fetch.
 * @returns Sample documents and schema map.
 */
export const getCollectionSchemaAndSampleDocuments = async (
  collectionName: string,
  sampleCount: number = 2
): Promise<{ sampleDocuments: Document[]; schemaMap: SchemaMap }> => {
  try {
    if (!databaseService.isDbActive()) {
      throw new Error('No active database connection to get schema and samples.');
    }
    const { sampleDocuments, schemaMap } = await databaseService.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);
    const transformedSampleDocuments = sampleDocuments.map(prepareDocumentForFrontend);
    logger.debug({ collectionName, sampleCount, schemaMapSize: Object.keys(schemaMap).length }, 'IPC: Fetched schema map and sample documents for Query Helper.');
    return { sampleDocuments: transformedSampleDocuments, schemaMap };
  } catch (error: any) {
    logger.error({ error, collectionName }, 'IPC: Failed to get schema and sample documents for Query Helper');
    throw new Error(`Failed to get schema and sample documents for Query Helper: ${error.message}`);
  }
};

/**
 * Generates a MongoDB query using the Grok-3-mini model based on a natural language prompt.
 * @param userPrompt The natural language request from the user.
 * @param collectionName The name of the collection for context.
 * @param schemaMap A map of field names to their possible types.
 * @param sampleDocuments A few sample documents from the collection.
 * @returns The generated MongoQueryParams JSON or an error.
 */
export const generateAIQuery = async (
  userPrompt: string,
  collectionName: string,
  shareSamples: boolean = false,
): Promise<{ generatedQuery?: string; error?: string }> => {
  try {
    const grokModel = "grok-3-mini";
    const apiUrl = `https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions`;

    const { sampleDocuments, schemaMap } = await getCollectionSchemaAndSampleDocuments(collectionName, 2);

    const formattedSampleDocs = (shareSamples && sampleDocuments && sampleDocuments.length > 0)
      ? `
Document Examples (first ${sampleDocuments.length} documents):
\`\`\`json
${JSON.stringify(sampleDocuments, null, 2)}
\`\`\`
` : '';

    // Handle null or undefined schemaMap
    logger.debug(`schemaMap: ${JSON.stringify(schemaMap)}`);
    let schemaSummary = '';
    if (schemaMap && Object.keys(schemaMap).length > 0) {
      schemaSummary = `Schema for ${collectionName} (inferred from ${sampleDocuments.length} samples):\n{\n`;
      for (const [key, types] of Object.entries(schemaMap)) {
        const typeStr = types.join(' | ');
        if (typeStr.includes('Date')) {
          schemaSummary += `  ${key}: ${typeStr}("YYYY-MM-DDTHH:mm:ss.sssZ")\n`;
        } else if (typeStr.includes('ObjectId')) {
          schemaSummary += `  ${key}: ${typeStr}("24-character-hex-string")\n`;
        } else {
          schemaSummary += `  ${key}: ${typeStr}\n`;
        }
      }
      schemaSummary += '}';
    } else {
      schemaSummary = `No schema could be inferred from sample documents in ${collectionName} (collection might be empty or samples invalid).`;
    }
    logger.debug(schemaSummary);

    const systemInstruction = `As an expert MongoDB query generator, convert natural language descriptions into a valid MongoDB query parameters JSON object conforming to the following structure:
{
  "query"?: string,
  "sort"?: string,
  "filter"?: string,
  "pipeline"?: string[],
  "projection"?: string,
  "collation"?: string,
  "hint"?: string,
  "readPreference"?: string
}
- Include only the fields relevant to the user's prompt.
- For relative time expressions (e.g., "within the last week", "last 7 days"), calculate the date relative to ${new Date().toISOString()}.
- Do not use ISODate or ObjectId in the generated query, but use string a representation of the values.
- For simple queries, use "query" for MongoDB find operations.
- Use "pipeline" only for explicit aggregation requests (e.g., grouping, joining).
- Ensure "sort" values are 1, -1, "asc", or "desc".
- Ensure "collation" includes a "locale" property if specified.
- Ensure "readPreference" is one of: "primary", "primaryPreferred", "secondary", "secondaryPreferred", "nearest".
Respond ONLY with the raw JSON object. Do not include any other text, explanations, or markdown fences.`;
    logger.debug(`System prompt: ${systemInstruction}`);

    const prompt = `Given the following MongoDB collection information:

Collection Name: "${collectionName}"

${schemaSummary}
${formattedSampleDocs}
Based on this context, generate a MongoDB query parameters JSON object for the following natural language request:

"${userPrompt}"`;
    logger.debug(`User prompt: ${prompt}`);

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

    logger.debug({ collectionName, userPromptLength: userPrompt.length, sampleDocCount: sampleDocuments.length, model: payload.model },
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
    if (result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
      const generatedText = result.choices[0].message.content;
      logger.debug({ generatedTextLength: generatedText.length, generatedText }, `Query Helper (${grokModel}) returned a response.`);

      try {
        JSON.parse(generatedText);
        return { generatedQuery: generatedText };
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
