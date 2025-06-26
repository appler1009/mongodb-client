// backend/src/services/mongoDriverChooser.ts

// Dynamic imports are best here to avoid loading all drivers if not needed,
// but for simplicity with file: dependencies and commonjs, we'll use static imports first.
// If you encounter memory issues or slow startup due to many unused drivers,
// consider using dynamic `import()` calls (which would require converting to ESM
// or careful handling with CommonJS). For now, static imports are simpler to type.

import { MongoDBWrapperV6, MongoClientOptions as MongoClientOptionsV6, MongoClient as MongoClientV6 } from 'mongodb-wrapper-v6';
import { MongoDBWrapperV5, MongoClientOptions as MongoClientOptionsV5, MongoClient as MongoClientV5 } from 'mongodb-wrapper-v5';
import { MongoDBWrapperV4, MongoClientOptions as MongoClientOptionsV4, MongoClient as MongoClientV4 } from 'mongodb-wrapper-v4';
import { MongoDBWrapperV3, MongoClientOptions as MongoClientOptionsV3, MongoClient as MongoClientV3 } from 'mongodb-wrapper-v3';

// Re-export common types from the newest driver for consistency.
// In a real application, you might abstract these further if there are
// significant breaking changes in interfaces across driver versions.
export { Db, Collection, Document, ObjectId, WithId, InsertOneResult, UpdateResult, DeleteResult } from 'mongodb-wrapper-v6';
export type MongoClient = MongoClientV6; // Use the newest MongoClient type for the return

// Define a type for a generic MongoDB Wrapper constructor
// This helps us iterate through them cleanly
type MongoWrapperConstructor =
  | (new (uri: string, options?: MongoClientOptionsV6) => MongoDBWrapperV6)
  | (new (uri: string, options?: MongoClientOptionsV5) => MongoDBWrapperV5)
  | (new (uri: string, options?: MongoClientOptionsV4) => MongoDBWrapperV4)
  | (new (uri: string, options?: MongoClientOptionsV3) => MongoDBWrapperV3);

// For simplicity, we'll use the most comprehensive MongoClientOptions (from V6).
// Be aware that older drivers might not recognize all V6 options, but they usually ignore unknown ones.
export type UniversalMongoClientOptions = MongoClientOptionsV6;

interface ConnectionAttemptResult {
  client: MongoClient;
  wrapper: MongoDBWrapperV6 | MongoDBWrapperV5 | MongoDBWrapperV4 | MongoDBWrapperV3;
  driverVersion: 'v6' | 'v5' | 'v4' | 'v3';
}

/**
 * Attempts to connect to MongoDB using different driver versions, from newest to oldest.
 * This function handles the fallback logic.
 * @param uri The MongoDB connection URI.
 * @param options MongoClientOptions to pass to the driver. Note: Options might behave differently across driver versions.
 * @returns A Promise that resolves with the connected MongoClient, the wrapper instance used, and its driver version.
 * @throws An Error if connection fails with all attempted driver versions.
 */
export async function connectWithDriverFallback(
  uri: string,
  options?: UniversalMongoClientOptions
): Promise<ConnectionAttemptResult> {
  // Define the order of wrappers to try (newest to oldest)
  const wrapperVersions: {
    version: 'v6' | 'v5' | 'v4' | 'v3';
    Wrapper: MongoWrapperConstructor;
  }[] = [
    { version: 'v6', Wrapper: MongoDBWrapperV6 },
    { version: 'v5', Wrapper: MongoDBWrapperV5 },
    { version: 'v4', Wrapper: MongoDBWrapperV4 },
    { version: 'v3', Wrapper: MongoDBWrapperV3 },
  ];

  for (const { version, Wrapper } of wrapperVersions) {
    console.log(`Attempting to connect with mongodb-wrapper-${version}... to ${uri}`);
    const wrapperInstance = new Wrapper(uri, options as any);
    try {
      // The connect method of each wrapper returns a MongoClient compatible with its version.
      // We'll cast it to MongoClientV6 for the return type, as it's the "widest" type.
      const client = (await wrapperInstance.connect()) as MongoClient;
      console.log(`Successfully connected with mongodb-wrapper-${version}.`);
      return { client, wrapper: wrapperInstance, driverVersion: version };
    } catch (error: any) {
      console.warn(`Connection failed with mongodb-wrapper-${version}: ${error.message}`);
      // Ensure the client is closed if a connection was briefly established but failed wire version check
      if (wrapperInstance && typeof wrapperInstance.disconnect === 'function') {
        try {
          await wrapperInstance.disconnect();
        } catch (closeError: any) {
          console.error(`Error closing wrapper ${version} client after failed attempt:`, closeError.message);
        }
      }
      // Continue to the next wrapper version
    }
  }

  throw new Error(
    `Failed to connect to MongoDB with any available driver version (${wrapperVersions.map(w => w.version).join(', ')}). ` +
    `Please check your MongoDB server's version and accessibility.`
  );
}
