// backend/src/types.ts

import { Sort, CollationOptions } from 'mongodb';

export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
  driverVersion?: 'v6' | 'v5' | 'v4' | 'v3'; // Optional field for the driver version that worked
}

export interface ConnectionStatus {
  message: string;
  connectionId?: string;
  database?: string;
}

export interface CollectionInfo {
  name: string;
  documentCount: number;
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

export interface MongoQueryParams {
  query?: object;
  sort?: Sort;
  filter?: object;
  pipeline?: any[];
  projection?: object;
  collation?: CollationOptions;
  hint?: object;
  readPreference?: string;
}
