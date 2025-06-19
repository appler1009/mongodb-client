// frontend/src/types.ts

// This interface mirrors the ConnectionConfig from the backend
export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
  database: string;
  username?: string;
  password?: string;
}

// Interface for the connection status from the backend
export interface ConnectionStatus {
  message: string;
  connectionId?: string;
  database?: string;
  error?: string;
}
