// backend/src/types.ts
export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
  database: string; // The default database to connect to
  username?: string; // Optional
  password?: string; // Optional
  // Add other MongoDB connection options as needed, e.g., authSource
}

export interface CollectionInfo {
  name: string;
}
