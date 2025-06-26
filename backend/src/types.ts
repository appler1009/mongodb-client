// backend/src/types.ts

export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
}

export interface ConnectionStatus {
  message: string;
  connectionId?: string;
  database?: string;
}

export interface CollectionInfo {
  name: string;
}

export interface Document extends Record<string, any> {
  _id?: any; // MongoDB ObjectId is often converted to string or object
}

// Interface for the documents response with total count
export interface DocumentsResponse {
  documents: Document[];
  totalDocuments: number;
}

// Schema for the connections electron-store
export interface ConnectionsStoreSchema {
    connections: ConnectionConfig[]; // This defines that the 'connections' key holds an array of ConnectionConfig
}
