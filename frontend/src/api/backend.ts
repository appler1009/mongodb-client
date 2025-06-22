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
      deleteConnection: (id: string) => Promise<boolean>; // Backend now returns boolean from IPC

      // MongoDB Connection IPC calls
      connectToMongo: (connectionId: string) => Promise<ConnectionStatus>;
      disconnectFromMongo: () => Promise<ConnectionStatus>;

      // Database Browse IPC calls
      getDatabaseCollections: () => Promise<CollectionInfo[]>;
      getCollectionDocuments: (collectionName: string, limit: number, skip: number, query: object) => Promise<DocumentsResponse>;
      exportCollectionDocuments: (collectionName: string, query: object) => Promise<string>; // Backend returns NDJSON string

      // File system interaction (via Main Process for security)
      saveFile: (defaultFilename: string, content: string) => Promise<boolean>; // Returns true on success, false on cancel/error
    };
  }
}

// --- Connection Management API Calls ---

export const getConnections = (): Promise<ConnectionConfig[]> => {
  // Directly call the exposed Electron API method
  return window.electronAPI.getConnections();
};

export const addConnection = (connection: Omit<ConnectionConfig, 'id'>): Promise<ConnectionConfig> => {
  return window.electronAPI.addConnection(connection);
};

export const updateConnection = (id: string, connection: ConnectionConfig): Promise<ConnectionConfig | null> => {
  return window.electronAPI.updateConnection(id, connection);
};

export const deleteConnection = (id: string): Promise<void> => {
  // The IPC handler returns a boolean. We need to convert it to Promise<void>
  // and handle the "not found" case as an error if desired, to match previous signature.
  return window.electronAPI.deleteConnection(id).then(deleted => {
    if (!deleted) {
      throw new Error('Connection not found for deletion.');
    }
    return; // Resolve with void for successful deletion
  });
};

// --- MongoDB Connection API Calls ---

export const connectToMongo = (connectionId: string): Promise<ConnectionStatus> => {
  return window.electronAPI.connectToMongo(connectionId);
};

export const disconnectFromMongo = (): Promise<ConnectionStatus> => {
  return window.electronAPI.disconnectFromMongo();
};

// Health check: No longer an HTTP API call.
// If a health check is needed for internal Electron status, you would add an IPC handler for it.
// For now, we can remove it or return a static promise as it's not a direct backend interaction.
export const getHealthStatus = (): Promise<{ status: string; message: string }> => {
    // Return a resolved promise as there's no direct IPC equivalent for a simple "health check"
    // unless you specifically create one in main.js and preload.js.
    // This assumes the Electron app itself running implies "health".
    return Promise.resolve({ status: 'ok', message: 'Electron IPC backend is active.' });
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
export async function exportCollectionDocuments(collectionName: string, query: object): Promise<void> {
  try {
    // 1. Get the NDJSON content from the main process via IPC
    const ndjsonContent = await window.electronAPI.exportCollectionDocuments(collectionName, query);

    // 2. Request the main process to show a save dialog and save the file
    //    The main process handles file system access (Electron's dialog module).
    const defaultFilename = `${collectionName}_export_${Date.now()}.jsonl`;

    const savedSuccessfully = await window.electronAPI.saveFile(defaultFilename, ndjsonContent);

    if (!savedSuccessfully) {
        // User cancelled the dialog or file saving failed for other reasons
        throw new Error('File export cancelled or failed.');
    }

  } catch (error: any) {
    // Handle errors from the IPC calls
    console.error('Failed to export documents:', error);
    // Re-throw or provide a user-friendly message
    throw new Error(`Failed to export documents: ${error.message || 'An unknown error occurred during export.'}`);
  }
}
