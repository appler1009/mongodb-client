// backend/src/types.ts

import { Sort, CollationOptions } from 'mongodb';

export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
  driverVersion?: 'v6' | 'v5' | 'v4' | 'v3'; // Optional field for the driver version that worked
}

// Define an enum for the actual status values
export enum ConnectionStateValue {
  Connected = 'CONNECTED',
  Disconnected = 'DISCONNECTED',
  Error = 'ERROR',
  Connecting = 'CONNECTING', // You might want to add this for states during connection
}

// Update the ConnectionStatus interface to include a 'status' field
export interface ConnectionStatus {
  name?: string;
  message: string;
  connectionId?: string;
  database?: string;
  status?: ConnectionStateValue;
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
  query?: string; // JSON-stringified, e.g., '{"timestamp":{"$gte":"2025-06-30T00:00:00.000Z"}}'
  sort?: string; // JSON-stringified, e.g., '{"name":1}'
  filter?: string; // JSON-stringified, e.g., '{"status":"active"}'
  pipeline?: string[]; // Array of JSON-stringified stages, e.g., ['{"$match":{"age":30}}']
  projection?: string; // JSON-stringified, e.g., '{"name":1}'
  collation?: string; // JSON-stringified, e.g., '{"locale":"en"}'
  hint?: string; // JSON-stringified or index name, e.g., '{"name":1}' or '"indexName"'
  readPreference?: string; // e.g., "primary"
  queryId?: string; // Unique identifier for the query to enable cancellation
}

// Schema map type for representing field types in a collection
export type SchemaMap = { [field: string]: string[] };
