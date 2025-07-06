import type { ConnectionConfig, ConnectionStatus, CollectionInfo, DocumentsResponse, Document, MongoQueryParams } from '../types';
import type { Theme } from '../context/ThemeContext';

// Declare the Electron API on the Window object
// This tells TypeScript that `window.electronAPI` will exist at runtime
// and what methods it will have.
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
      // Note: saveFile now expects the sourceFilePath to be moved, not content
      saveFile: (defaultFilename: string, sourceFilePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;

      // --- Theme Management IPC calls ---
      saveThemePreference: (theme: Theme) => Promise<void>;
      loadThemePreference: () => Promise<Theme | null>;
      saveSystemThemePreference: (isActive: boolean) => Promise<void>;
      loadSystemThemePreference: () => Promise<boolean | null>;

      // --- AI Query Generation IPC calls ---
      getCollectionSchemaAndSampleDocuments: (collectionName: string, sampleCount?: number) => Promise<{ sampleDocuments: Document[]; schemaSummary: string }>;
      generateAIQuery: (userPrompt: string, collectionName: string, schemaSummary: string, sampleDocuments: Document[]) => Promise<{ generatedQuery?: string; error?: string }>;
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
  let tempFilePath: string | undefined; // Declare tempFilePath outside try for finally block access

  try {
    // 1. Request the backend (via main process IPC) to prepare the export
    //    and save it to a temporary file. This call now returns the path
    //    to that temporary file.
    tempFilePath = await window.electronAPI.exportCollectionDocuments(collectionName, params);

    // 2. Request the main process to show a save dialog and move the
    //    temporary file to the user-selected location.
    const defaultFilename = `${collectionName}_export_${Date.now()}.jsonl`;

    // Expect the object { success, filePath, error } from saveFile
    // Pass the tempFilePath as the 'sourceFilePath' argument
    const { success, filePath, error: saveError } = await window.electronAPI.saveFile(defaultFilename, tempFilePath);

    if (success && filePath) {
      // If successfully saved and path is returned
      return { success: true, filePath: filePath };
    } else if (!success && saveError) {
      // If save failed with an explicit error from main process
      return { success: false, error: saveError };
    } else {
      // If user cancelled (success is false, and no explicit error)
      return { success: false, error: 'File export cancelled.' };
    }
  } catch (error: any) {
    // This catches errors from window.electronAPI.exportCollectionDocuments (creating temp file)
    // or unexpected errors during the save process if it throws before the structured return.
    console.error('Failed to export documents during API call:', error);
    return { success: false, error: `Failed to export documents: ${error.message || 'An unknown error occurred during export.'}` };
  } finally {
    // The `file:save` IPC handler in main.js now handles the cleanup of the temporary
    // file, whether the save was successful or cancelled by the user after the temp
    // file was generated.
  }
}

// --- AI Query Generation API Calls ---

/**
 * Calls the backend to fetch schema summary and sample documents for AI query context.
 * @param collectionName The name of the collection.
 * @param sampleCount The number of sample documents to retrieve (default: 5).
 * @returns An object containing sample documents and schema summary.
 */
export const getCollectionSchemaAndSampleDocuments = (collectionName: string, sampleCount?: number) => {
  return window.electronAPI.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);
};

/**
 * Calls the backend to generate a MongoDB query using an AI model.
 * @param userPrompt The natural language prompt from the user.
 * @param collectionName The name of the collection.
 * @param schemaSummary The inferred schema of the collection.
 * @param sampleDocuments Sample documents from the collection.
 * @returns An object containing the generated query string or an error message.
 */
export const generateAIQuery = (userPrompt: string, collectionName: string, schemaSummary: string, sampleDocuments: Document[]) => {
  return window.electronAPI.generateAIQuery(userPrompt, collectionName, schemaSummary, sampleDocuments);
};

// NOTE: You don't need to export these theme functions from backend.ts
// because ThemeContext directly accesses them via window.electronAPI.
// However, declaring them in the global interface is crucial for TypeScript.
