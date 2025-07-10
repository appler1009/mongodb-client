import type { ConnectionConfig, ConnectionStatus, CollectionInfo, DocumentsResponse, Document, MongoQueryParams } from '../types';
import type { Theme } from '../context/ThemeContext';

// Define the schema map type for serialization
type SchemaMap = { [field: string]: string[] };

// Declare the Electron API on the Window object
declare global {
  interface Window {
    electronAPI: {
      // Connection Management IPC calls
      getConnections: () => Promise<ConnectionConfig[]>;
      addConnection: (connection: Omit<ConnectionConfig, 'id'>) => Promise<ConnectionConfig>;
      updateConnection: (id: string, connection: ConnectionConfig) => Promise<ConnectionConfig | null>;
      deleteConnection: (id: string) => Promise<boolean>;

      // MongoDB Connection IPC calls
      connectToMongo: (connectionId: string) => Promise<ConnectionStatus>;
      disconnectFromMongo: () => Promise<ConnectionStatus>;

      // Database Browse IPC calls
      getDatabaseCollections: () => Promise<CollectionInfo[]>;
      getCollectionDocuments: (collectionName: string, limit: number, skip: number, params: MongoQueryParams) => Promise<DocumentsResponse>;
      exportCollectionDocuments: (collectionName: string, params: MongoQueryParams) => Promise<string>;

      // File system interaction (via Main Process for security)
      saveFile: (defaultFilename: string, sourceFilePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;

      // Theme Management IPC calls
      saveThemePreference: (theme: Theme) => Promise<void>;
      loadThemePreference: () => Promise<Theme | null>;
      saveSystemThemePreference: (isActive: boolean) => Promise<void>;
      loadSystemThemePreference: () => Promise<boolean | null>;

      // AI Query Generation IPC calls
      getCollectionSchemaAndSampleDocuments: (collectionName: string, sampleCount?: number) => Promise<{ sampleDocuments: Document[]; schemaMap: SchemaMap }>;
      generateAIQuery: (userPrompt: string, collectionName: string, schemaMap: SchemaMap, sampleDocuments: Document[]) => Promise<{ generatedQuery?: string; error?: string }>;
    };
  }
}

// --- Connection Management API Calls ---

export const getConnections = (): Promise<ConnectionConfig[]> => {
  return window.electronAPI.getConnections();
};

export const addConnection = (connection: Omit<ConnectionConfig, 'id'>): Promise<ConnectionConfig> => {
  return window.electronAPI.addConnection(connection);
};

export const updateConnection = (id: string, connection: ConnectionConfig): Promise<ConnectionConfig | null> => {
  return window.electronAPI.updateConnection(id, connection);
};

export const deleteConnection = (id: string): Promise<void> => {
  return window.electronAPI.deleteConnection(id).then(deleted => {
    if (!deleted) {
      throw new Error('Connection not found for deletion.');
    }
    return;
  });
};

// --- MongoDB Connection API Calls ---

export const connectToMongo = (connectionId: string): Promise<ConnectionStatus> => {
  return window.electronAPI.connectToMongo(connectionId);
};

export const disconnectFromMongo = (): Promise<ConnectionStatus> => {
  return window.electronAPI.disconnectFromMongo();
};

// --- Database Browse API Calls ---

export const getDatabaseCollections = (): Promise<CollectionInfo[]> => {
  return window.electronAPI.getDatabaseCollections();
};

export const getCollectionDocuments = (
  collectionName: string,
  limit: number = 20,
  skip: number = 0,
  params: MongoQueryParams = {}
): Promise<DocumentsResponse> => {
  return window.electronAPI.getCollectionDocuments(collectionName, limit, skip, params);
};

// --- Export documents from a collection ---
export async function exportCollectionDocuments(
  collectionName: string,
  params: MongoQueryParams = {}
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  let tempFilePath: string | undefined;

  try {
    tempFilePath = await window.electronAPI.exportCollectionDocuments(collectionName, params);
    const defaultFilename = `${collectionName}_export_${Date.now()}.jsonl`;
    const { success, filePath, error: saveError } = await window.electronAPI.saveFile(defaultFilename, tempFilePath);

    if (success && filePath) {
      return { success: true, filePath: filePath };
    } else if (!success && saveError) {
      return { success: false, error: saveError };
    } else {
      return { success: false, error: 'File export cancelled.' };
    }
  } catch (error: any) {
    console.error('Failed to export documents during API call:', error);
    return { success: false, error: `Failed to export documents: ${error.message || 'An unknown error occurred during export.'}` };
  } finally {
    // Cleanup handled by main process
  }
}

// --- AI Query Generation API Calls ---

/**
 * Calls the backend to fetch schema map and sample documents for AI query context.
 * @param collectionName The name of the collection.
 * @param sampleCount The number of sample documents to retrieve (default: 5).
 * @returns An object containing sample documents and schema map.
 */
export const getCollectionSchemaAndSampleDocuments = (collectionName: string, sampleCount?: number) => {
  return window.electronAPI.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);
};

/**
 * Calls the backend to generate a MongoDB query using an AI model.
 * @param userPrompt The natural language prompt from the user.
 * @param collectionName The name of the collection.
 * @param schemaMap The inferred schema of the collection as a map of fields to their types.
 * @param sampleDocuments Sample documents from the collection.
 * @returns An object containing the generated query string or an error message.
 */
export const generateAIQuery = (userPrompt: string, collectionName: string, schemaMap: SchemaMap, sampleDocuments: Document[]) => {
  return window.electronAPI.generateAIQuery(userPrompt, collectionName, schemaMap, sampleDocuments);
};
