import * as pino from 'pino';
import { MongoDBWrapperV6, MongoClientOptions as MongoClientOptionsV6, MongoClient as MongoClientV6 } from 'mongodb-wrapper-v6';
import { MongoDBWrapperV5, MongoClientOptions as MongoClientOptionsV5, MongoClient as MongoClientV5 } from 'mongodb-wrapper-v5';
import { MongoDBWrapperV4, MongoClientOptions as MongoClientOptionsV4, MongoClient as MongoClientV4 } from 'mongodb-wrapper-v4';
import { MongoDBWrapperV3, MongoClientOptions as MongoClientOptionsV3, MongoClient as MongoClientV3 } from 'mongodb-wrapper-v3';

// Re-export common types from the newest driver (v6) for consistency
export {
  Db,
  Collection,
  Document,
  ObjectId,
  WithId,
  InsertOneResult,
  UpdateResult,
  DeleteResult,
  FindCursor,
  AggregationCursor
} from 'mongodb-wrapper-v6';
export type MongoClient = MongoClientV6; // Use the newest MongoClient type for the return

// Define a type for a generic MongoDB Wrapper constructor
type MongoWrapperConstructor =
  | (new (uri: string, options?: MongoClientOptionsV6) => MongoDBWrapperV6)
  | (new (uri: string, options?: MongoClientOptionsV5) => MongoDBWrapperV5)
  | (new (uri: string, options?: MongoClientOptionsV4) => MongoDBWrapperV4)
  | (new (uri: string, options?: MongoClientOptionsV3) => MongoDBWrapperV3);

// For simplicity, use the most comprehensive MongoClientOptions (from V6)
export type UniversalMongoClientOptions = MongoClientOptionsV6;

interface ConnectionAttemptResult {
  client: MongoClient;
  wrapper: MongoDBWrapperV6 | MongoDBWrapperV5 | MongoDBWrapperV4 | MongoDBWrapperV3;
  driverVersion: 'v6' | 'v5' | 'v4' | 'v3';
}

/**
 * Attempts to connect to MongoDB using different driver versions, from newest to oldest.
 * If a knownVersion is provided, it attempts to connect with that version only, skipping fallback.
 * @param uri The MongoDB connection URI.
 * @param options MongoClientOptions to pass to the driver, including optional connectTimeoutMS.
 * @param knownVersion Optional known working driver version (v6, v5, v4, or v3) to skip fallback searching.
 * @returns A Promise that resolves with the connected MongoClient, the wrapper instance used, and its driver version.
 * @throws An Error if connection fails with the known version or all attempted driver versions.
 */
export async function connectWithDriverFallback(
  uri: string,
  logger: pino.Logger,
  options?: UniversalMongoClientOptions,
  knownVersion?: 'v6' | 'v5' | 'v4' | 'v3',
  signal?: AbortSignal
): Promise<ConnectionAttemptResult> {
  // Check for early abortion
  if (signal?.aborted) {
    throw new AbortError('Connection attempt aborted');
  }
  // If knownVersion is provided, attempt connection with that version only
  if (knownVersion) {
    logger.info(`Connecting with mongodb-wrapper-${knownVersion}... to ${uri}`);
    let Wrapper: MongoWrapperConstructor;
    switch (knownVersion) {
      case 'v6':
        Wrapper = MongoDBWrapperV6;
        break;
      case 'v5':
        Wrapper = MongoDBWrapperV5;
        break;
      case 'v4':
        Wrapper = MongoDBWrapperV4;
        break;
      case 'v3':
        Wrapper = MongoDBWrapperV3;
        break;
      default:
        throw new Error(`Invalid knownVersion '${knownVersion}'. Must be 'v6', 'v5', 'v4', or 'v3'.`);
    }
    const wrapperInstance = new Wrapper(uri, options as any);
    try {
      if (signal?.aborted) throw new AbortError('Connection attempt aborted');
      const client = (await wrapperInstance.connect()) as MongoClient;
      logger.info(`Successfully connected with mongodb-wrapper-${knownVersion}.`);
      return { client, wrapper: wrapperInstance, driverVersion: knownVersion };
    } catch (error: any) {
      if (signal?.aborted) {
        logger.info(`Connection attempt with ${knownVersion} aborted.`);
      } else {
        logger.warn(`Connection failed with mongodb-wrapper-${knownVersion}: ${error.message}`);
      }
      if (wrapperInstance && typeof wrapperInstance.disconnect === 'function') {
        try {
          await wrapperInstance.disconnect();
        } catch (closeError: any) {
          logger.error(`Error closing wrapper ${knownVersion} client after failed attempt: ${closeError.message}`);
        }
      }
      if (signal?.aborted) {
        throw new AbortError('Connection attempt aborted');
      }
      throw new Error(`Failed to connect with known version ${knownVersion}: ${error.message}`);
    }
  }

  // Fallback to trying all versions if no knownVersion is provided
  const wrapperVersions: { version: 'v6' | 'v5' | 'v4' | 'v3'; Wrapper: MongoWrapperConstructor }[] = [
    { version: 'v6', Wrapper: MongoDBWrapperV6 },
    { version: 'v5', Wrapper: MongoDBWrapperV5 },
    { version: 'v4', Wrapper: MongoDBWrapperV4 },
    { version: 'v3', Wrapper: MongoDBWrapperV3 },
  ];

  for (const { version, Wrapper } of wrapperVersions) {
    logger.info(`Attempting to connect with mongodb-wrapper-${version}... to ${uri}`);
    if (signal?.aborted) {
      throw new AbortError('Connection attempt aborted');
    }
    const wrapperInstance = new Wrapper(uri, options as any);
    try {
      if (signal?.aborted) throw new AbortError('Connection attempt aborted');
      const client = (await wrapperInstance.connect()) as MongoClient;
      logger.info(`Successfully connected with mongodb-wrapper-${version}.`);
      return { client, wrapper: wrapperInstance, driverVersion: version };
    } catch (error: any) {
      if (signal?.aborted) {
        logger.info(`Connection attempt with ${version} aborted.`);
      } else {
        logger.warn(`Connection failed with mongodb-wrapper-${version}: ${error.message}`);
      }
      if (wrapperInstance && typeof wrapperInstance.disconnect === 'function') {
        try {
          await wrapperInstance.disconnect();
        } catch (closeError: any) {
          logger.error(`Error closing wrapper ${version} client after failed attempt: ${closeError.message}`);
        }
      }
    }
  }

  if (signal?.aborted) {
    throw new AbortError('Connection attempt aborted');
  }
  throw new Error(
    `Failed to connect to MongoDB with any available driver version (${wrapperVersions.map(w => w.version).join(', ')}). ` +
    `Please check your MongoDB server's version and accessibility.`
  );
}

// Custom error class to identify abort-related errors
class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
