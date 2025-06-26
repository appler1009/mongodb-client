// frontend/src/api/backend.ts
import type { ConnectionConfig, ConnectionStatus, CollectionInfo, DocumentsResponse } from '../types';
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
      getCollectionDocuments: (collectionName: string, limit: number, skip: number, query: object) => Promise<DocumentsResponse>;
      exportCollectionDocuments: (collectionName: string, query: object) => Promise<string>; // Backend returns NDJSON string

      // File system interaction (via Main Process for security)
      saveFile: (defaultFilename: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;

      // --- Theme Management IPC calls ---
      // These will be used by ThemeContext to persist preferences
      saveThemePreference: (theme: Theme) => Promise<void>; // Saves the 'light'/'dark' preference
      loadThemePreference: () => Promise<Theme | null>; // Loads the saved theme preference
      saveSystemThemePreference: (isActive: boolean) => Promise<void>; // Saves if 'use system theme' is active
      loadSystemThemePreference: () => Promise<boolean | null>; // Loads if 'use system theme' is active
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
export async function exportCollectionDocuments(
  collectionName: string,
  query: object
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  let tempFilePath: string | undefined; // Declare tempFilePath outside try for finally block access

  try {
    // 1. Request the backend (via main process IPC) to prepare the export
    //    and save it to a temporary file. This call now returns the path
    //    to that temporary file.
    tempFilePath = await window.electronAPI.exportCollectionDocuments(collectionName, query);

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
    // Optional: Add a cleanup mechanism for the temporary file if the save operation was cancelled
    // or failed *after* the temp file was created.
    // In your current setup, main.js's `file:save` handler handles deletion upon successful `fs.rename`.
    // However, if the user cancels the dialog *after* the temp file is created but *before* saveFile is called,
    // or if `saveFile` throws an unexpected error, the temp file might be left behind.
    // A more robust cleanup strategy would involve the main process managing its own temp files
    // and cleaning them up on app close, or having a dedicated IPC for explicit temp file deletion.
    // For now, if the `file:save` handles cleanup correctly on success, this might be less critical here.
  }
}

// NOTE: You don't need to export these theme functions from backend.ts
// because ThemeContext directly accesses them via window.electronAPI.
// However, declaring them in the global interface is crucial for TypeScript.
