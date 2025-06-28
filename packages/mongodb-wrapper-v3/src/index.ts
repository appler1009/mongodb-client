// packages/mongodb-wrapper-v3/src/index.ts
import { MongoClient, MongoClientOptions, Db, Collection, ObjectId } from 'mongodb';

// Define a type for a generic MongoDB document for v3.x.x.
// In MongoDB driver v3, documents are generally treated as plain objects.
// If you need more specific BSON types, you might import from 'bson' package,
// but for a general wrapper, this 'Record<string, any>' is usually sufficient.
export type MongoDBDocumentV3 = Record<string, any>;

// Re-export common classes and types from the underlying 'mongodb' driver v3.x.x
// Removed 'Document' from here as well.
export { MongoClient, MongoClientOptions, Db, Collection, ObjectId, MongoDBDocumentV3 as Document };

export class MongoDBWrapperV3 {
  private client: MongoClient | null = null;
  private uri: string;
  private options?: MongoClientOptions;
  // MongoDB 3.0+ corresponds to Wire Version 3+.
  // MongoDB Node.js Driver v3 generally supports Wire Version 2-7 (MongoDB 2.6 to 4.0).
  private requiredWireVersion = 3;

  constructor(uri: string, options?: MongoClientOptions) {
    this.uri = uri;
    this.options = options;
  }

  public async connect(): Promise<MongoClient> {
    if (this.client) {
      try {
        await this.client.connect();
        console.log("MongoDBWrapperV3: Reusing existing client connection.");
      } catch (reuseError) {
        this.client = null;
        console.warn("MongoDBWrapperV3: Existing client was not reusable, attempting fresh connection.");
        return this.connect();
      }
    } else {
      // Create a new MongoClient instance if none exists
      this.client = new MongoClient(this.uri, {
        ...this.options, // Spread any provided options
        useNewUrlParser: true, // Required for v3.x.x driver
        useUnifiedTopology: true, // Required for v3.x.x driver
      });
      await this.client.connect();
    }

    try {
      // Use the 'isMaster' command for older drivers
      const isMasterResult = await this.client.db().command({ isMaster: 1 });
      const maxWireVersion = isMasterResult.ok === 1 && typeof isMasterResult.maxWireVersion === 'number' ? isMasterResult.maxWireVersion : undefined;

      if (maxWireVersion !== undefined && maxWireVersion < this.requiredWireVersion) {
        await this.disconnect();
        throw new Error(
          `Server at ${this.uri.split('@').pop()} reports maximum wire version ${maxWireVersion}, ` +
          `but mongodb-wrapper-v3 requires at least wire version ${this.requiredWireVersion} (MongoDB 3.0+). ` +
          `Please use a compatible MongoDB server or a newer driver version.`
        );
      }

      console.log(`MongoDBWrapperV3: Successfully connected to ${this.uri.split('@').pop()}`);
      return this.client;
    } catch (error: any) {
      console.error(`MongoDBWrapperV3: Failed to connect to ${this.uri.split('@').pop()}:`, error);
      this.client = null;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('MongoDBWrapperV3: Disconnected from MongoDB.');
    }
  }

  public getDb(dbName?: string): Db { // Explicitly use imported Db type
    if (!this.client) {
      throw new Error('MongoDBWrapperV3: Not connected to MongoDB. Call connect() first.');
    }
    return this.client.db(dbName);
  }
}
