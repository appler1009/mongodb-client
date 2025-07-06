// frontend/src/types.ts

// This interface mirrors the ConnectionConfig from the backend
export interface ConnectionConfig {
  id: string;
  name: string;
  uri: string;
  driverVersion?: 'v6' | 'v5' | 'v4' | 'v3'; // Optional field for the driver version that worked
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

// Represents a MongoDB aggregation pipeline stage
interface PipelineStage {
  [key: string]: Document;
}

// Represents a MongoDB sort specification
interface SortSpec {
  [key: string]: 1 | -1 | 'asc' | 'desc';
}

// Represents a MongoDB collation specification
interface CollationSpec {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: 'upper' | 'lower' | 'off';
  strength?: 1 | 2 | 3 | 4 | 5;
  numericOrdering?: boolean;
  alternate?: 'non-ignorable' | 'shifted';
  maxVariable?: 'punct' | 'space';
  backwards?: boolean;
  normalization?: boolean;
}

// Represents a MongoDB index hint
interface HintSpec {
  [key: string]: 1 | -1 | string;
}

export interface MongoQueryParams {
  query?: object;
  sort?: SortSpec;
  filter?: object;
  pipeline?: PipelineStage[];
  projection?: object;
  collation?: CollationSpec;
  hint?: HintSpec;
  readPreference?: string;
}
