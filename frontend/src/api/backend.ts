// frontend/src/api/backend.ts
import type { ConnectionConfig, ConnectionStatus, CollectionInfo, DocumentsResponse } from '../types';

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
      getCollectionDocuments: (collectionName: string, limit: number, skip: number, query: object) => Promise<DocumentsResponse>;
      exportCollectionDocuments: (collectionName: string, query: object) => Promise<string>; // Backend returns NDJSON string

      // File system interaction (via Main Process for security)
      saveFile: (defaultFilename: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
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
  query: object = {}
): Promise<DocumentsResponse> => {
  return window.electronAPI.getCollectionDocuments(collectionName, limit, skip, query);
};

// --- Export documents from a collection ---
// UPDATED: Now returns { success: boolean; filePath?: string; error?: string }
export async function exportCollectionDocuments(
  collectionName: string,
  query: object
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // 1. Get the NDJSON content from the main process via IPC
    const ndjsonContent = await window.electronAPI.exportCollectionDocuments(collectionName, query);

    // 2. Request the main process to show a save dialog and save the file
    const defaultFilename = `${collectionName}_export_${Date.now()}.jsonl`;

    // Expect the object { success, filePath, error } from saveFile
    const { success, filePath, error: saveError } = await window.electronAPI.saveFile(defaultFilename, ndjsonContent);

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
    // This catches errors from window.electronAPI.exportCollectionDocuments (getting content)
    // or unexpected errors during the save process.
    console.error('Failed to export documents during API call:', error);
    return { success: false, error: `Failed to export documents: ${error.message || 'An unknown error occurred during export.'}` };
  }
}
