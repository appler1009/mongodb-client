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
  skip: number = 0,
  query: object = {}
): Promise<DocumentsResponse> => {
  // This will now call the /api/database/documents/:collectionName endpoint
  // using a POST request, with limit, skip, and query in the request body.
  return request<DocumentsResponse>(
    'POST',
    `/database/documents/${collectionName}`,
    { limit, skip, query }
  );
};

// --- Export documents from a collection ---
export async function exportCollectionDocuments(collectionName: string, query: object): Promise<void> {
  const url = `${API_BASE_URL}/database/documents/${collectionName}/export`;

  // We are not using the 'request' helper here because it expects a JSON response,
  // but for file download, we need to handle the Blob directly.
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }), // Send the query in the request body
  });

  if (!response.ok) {
    // If the response is not OK, try to parse an error message from JSON
    const errorData = await response.json().catch(() => ({ message: 'Unknown error during export.' }));
    throw new Error(errorData.message || 'Failed to export documents');
  }

  // Extract filename from Content-Disposition header, or use a default
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `${collectionName}_export_${Date.now()}.jsonl`; // Default filename with timestamp
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="([^"]+)"/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  // Create a Blob from the response (which is the file content)
  const blob = await response.blob();
  const urlBlob = window.URL.createObjectURL(blob); // Create a URL for the blob

  // Create a temporary link element to trigger the download
  const a = document.createElement('a');
  a.href = urlBlob;
  a.download = filename; // Set the download filename
  document.body.appendChild(a); // Append to body (required for Firefox)
  a.click(); // Programmatically click the link to trigger download
  document.body.removeChild(a); // Clean up the temporary link
  window.URL.revokeObjectURL(urlBlob); // Revoke the object URL to free up memory
}
