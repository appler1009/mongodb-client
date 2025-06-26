// packages/mongodb-wrapper-v5/src/index.ts
import { MongoClient, MongoClientOptions } from 'mongodb';

// Re-export common classes and types from the underlying 'mongodb' driver v5.x.x
export { MongoClient } from 'mongodb';
export { MongoClientOptions, Db, Collection, Document, ObjectId, WithId, InsertOneResult, UpdateResult, DeleteResult } from 'mongodb';

export class MongoDBWrapperV5 {
  private client: MongoClient | null = null;
  private uri: string;
  private options?: MongoClientOptions;
  // MongoDB 4.0+ corresponds to Wire Version 7+.
  // MongoDB Node.js Driver v5 generally supports Wire Version 7-11 (MongoDB 4.0 to 6.0).
  private requiredWireVersion = 7;

  constructor(uri: string, options?: MongoClientOptions) {
    this.uri = uri;
    this.options = options;
  }

  public async connect(): Promise<MongoClient> {
    if (this.client) {
      try {
        await this.client.connect();
        console.log("MongoDBWrapperV5: Reusing existing client connection.");
      } catch (reuseError) {
        this.client = null;
        console.warn("MongoDBWrapperV5: Existing client was not reusable, attempting fresh connection.");
        return this.connect(); // Recurse to try a fresh connection
      }
    } else {
      this.client = new MongoClient(this.uri, this.options);
      await this.client.connect();
    }

    try {
      // Use the 'hello' command which is less privileged and typically does not require admin roles.
      const helloResult = await this.client.db().command({ hello: 1 });
      const maxWireVersion = helloResult.ok === 1 && typeof helloResult.maxWireVersion === 'number' ? helloResult.maxWireVersion : undefined;

      if (maxWireVersion !== undefined && maxWireVersion < this.requiredWireVersion) {
        await this.disconnect(); // Disconnect if incompatible
        throw new Error(
          `Server at ${this.uri.split('@').pop()} reports maximum wire version ${maxWireVersion}, ` +
          `but mongodb-wrapper-v5 requires at least wire version ${this.requiredWireVersion} (MongoDB 4.0+). ` +
          `Please use a compatible MongoDB server or a different driver version (e.g., mongodb-wrapper-v4 for MongoDB 3.6).`
        );
      }

      console.log(`MongoDBWrapperV5: Successfully connected to ${this.uri.split('@').pop()}`);
      return this.client;
    } catch (error: any) {
      console.error(`MongoDBWrapperV5: Failed to connect to ${this.uri.split('@').pop()}:`, error);
      this.client = null;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('MongoDBWrapperV5: Disconnected from MongoDB.');
    }
  }

  public getDb(dbName?: string): import('mongodb').Db {
    if (!this.client) {
      throw new Error('MongoDBWrapperV5: Not connected to MongoDB. Call connect() first.');
    }
    return this.client.db(dbName);
  }
}
