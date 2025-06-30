// frontend/src/types.ts

// This interface mirrors the ConnectionConfig from the backend
export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
}

// Interface for the connection status from the backend
export interface ConnectionStatus {
  message: string;
  connectionId?: string;
  database?: string;
  error?: string;
}

// Interface for a MongoDB collection (mirrors backend/src/types.ts)
export interface CollectionInfo {
  name: string;
  documentCount: number;
}

// Generic interface for a MongoDB document
export interface Document {
  [key: string]: unknown;
}

// Interface for the response when fetching a list of documents
export interface DocumentsResponse {
  documents: Document[];
  totalDocuments: number;
}
