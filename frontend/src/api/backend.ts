// frontend/src/api/backend.ts
import type { ConnectionConfig, ConnectionStatus, CollectionInfo, DocumentsResponse } from '../types';

// Use a relative path /api, Vite's proxy will handle the redirection in dev
// For production, you'd configure your web server (nginx, etc.) to proxy /api requests
const API_BASE_URL = '/api'; // This is correct for the proxy setup

// Helper for making requests with JSON bodies
async function request<T>(method: string, path: string, data?: any): Promise<T> {
  // The path argument should NOT start with /api here, as API_BASE_URL already provides it.
  const url = `${API_BASE_URL}${path}`; // This will now correctly form /api/connections
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorBody.message || `API error: ${response.statusText}`);
  }

  // Handle 204 No Content for delete operations
  if (response.status === 204) {
    return null as T; // Return null for no content
  }

  return response.json();
}

// --- Connection Management API Calls ---

export const getConnections = (): Promise<ConnectionConfig[]> => {
  return request<ConnectionConfig[]>('GET', '/connections');
};

export const addConnection = (connection: Omit<ConnectionConfig, 'id'>): Promise<ConnectionConfig> => {
  return request<ConnectionConfig>('POST', '/connections', connection);
};

export const updateConnection = (id: string, connection: ConnectionConfig): Promise<ConnectionConfig> => {
  return request<ConnectionConfig>('PUT', `/connections/${id}`, connection);
};

export const deleteConnection = (id: string): Promise<void> => {
  return request<void>('DELETE', `/connections/${id}`);
};

// --- MongoDB Connection API Calls ---

export const connectToMongo = (connectionId: string): Promise<ConnectionStatus> => {
  return request<ConnectionStatus>('POST', '/connect', { id: connectionId });
};

export const disconnectFromMongo = (): Promise<ConnectionStatus> => {
  return request<ConnectionStatus>('POST', '/disconnect');
};

// Health check (useful for debugging network issues)
export const getHealthStatus = (): Promise<{ status: string; message: string }> => {
  return request<{ status: string; message: string }>('GET', '/health');
};


// --- Database Browse API Calls ---

export const getDatabaseCollections = (): Promise<CollectionInfo[]> => {
  // This calls the /api/database/collections endpoint
  return request<CollectionInfo[]>('GET', '/database/collections');
};

// accept skip and limit, and return DocumentsResponse
export const getCollectionDocuments = (
  collectionName: string,
  limit: number = 20,
  skip: number = 0
): Promise<DocumentsResponse> => {
  // This calls the /api/database/documents/:collectionName endpoint
  // We can pass limit and skip as query parameters
  return request<DocumentsResponse>('GET', `/database/documents/${collectionName}?limit=${limit}&skip=${skip}`);
};
