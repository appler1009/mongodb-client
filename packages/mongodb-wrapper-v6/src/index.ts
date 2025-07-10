// packages/mongodb-wrapper-v6/src/index.ts
import { MongoClient, MongoClientOptions } from 'mongodb';

export { MongoClient } from 'mongodb';
export { MongoClientOptions, Db, Collection, Document, ObjectId, WithId, InsertOneResult, UpdateResult, DeleteResult, FindCursor, AggregationCursor } from 'mongodb';

export class MongoDBWrapperV6 {
  private client: MongoClient | null = null;
  private uri: string;
  private options?: MongoClientOptions;
  private requiredWireVersion = 8; // MongoDB 4.2+ (Wire Version 8-18) is supported by MongoDB Node.js Driver v6

  constructor(uri: string, options?: MongoClientOptions) {
    this.uri = uri;
    this.options = options;
  }

  public async connect(): Promise<MongoClient> {
    if (this.client) {
      try {
        await this.client.connect();
        console.log("MongoDBWrapperV6: Reusing existing client connection.");
      } catch (reuseError) {
        this.client = null;
        console.warn("MongoDBWrapperV6: Existing client was not reusable, attempting fresh connection.");
        return this.connect();
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
          `but mongodb-wrapper-v6 requires at least wire version ${this.requiredWireVersion} (MongoDB 4.2+). ` +
          `Please use a compatible MongoDB server or an older driver version (e.g., mongodb-wrapper-v4 for MongoDB 3.6-4.0).`
        );
      }

      console.log(`MongoDBWrapperV6: Successfully connected to ${this.uri.split('@').pop()}`);
      return this.client;
    } catch (error: any) {
      console.error(`MongoDBWrapperV6: Failed to connect to ${this.uri.split('@').pop()}:`, error);
      this.client = null;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('MongoDBWrapperV6: Disconnected from MongoDB.');
    }
  }

  public getDb(dbName?: string): import('mongodb').Db {
    if (!this.client) {
      throw new Error('MongoDBWrapperV6: Not connected to MongoDB. Call connect() first.');
    }
    return this.client.db(dbName);
  }
}
