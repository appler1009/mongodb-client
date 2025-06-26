// packages/mongodb-wrapper-v4/src/index.ts
import { MongoClient, MongoClientOptions } from 'mongodb';

// Re-export common classes and types from the underlying 'mongodb' driver v4.x.x
export { MongoClient } from 'mongodb';
export { MongoClientOptions, Db, Collection, Document, ObjectId, WithId, InsertOneResult, UpdateResult, DeleteResult } from 'mongodb';

export class MongoDBWrapperV4 {
  private client: MongoClient | null = null;
  private uri: string;
  private options?: MongoClientOptions;
  // MongoDB 3.6+ corresponds to Wire Version 6+.
  // MongoDB Node.js Driver v4 generally supports Wire Version 6-10 (MongoDB 3.6 to 5.0).
  private requiredWireVersion = 6;

  constructor(uri: string, options?: MongoClientOptions) {
    this.uri = uri;
    this.options = options;
  }

  public async connect(): Promise<MongoClient> {
    if (this.client) {
      try {
        await this.client.connect();
        console.log("MongoDBWrapperV4: Reusing existing client connection.");
      } catch (reuseError) {
        this.client = null;
        console.warn("MongoDBWrapperV4: Existing client was not reusable, attempting fresh connection.");
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
        await this.disconnect();
        throw new Error(
          `Server at ${this.uri.split('@').pop()} reports maximum wire version ${maxWireVersion}, ` +
          `but mongodb-wrapper-v4 requires at least wire version ${this.requiredWireVersion} (MongoDB 3.6+). ` +
          `Please use a compatible MongoDB server or a different driver version.`
        );
      }

      console.log(`MongoDBWrapperV4: Successfully connected to ${this.uri.split('@').pop()}`);
      return this.client;
    } catch (error: any) {
      console.error(`MongoDBWrapperV4: Failed to connect to ${this.uri.split('@').pop()}:`, error);
      this.client = null;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('MongoDBWrapperV4: Disconnected from MongoDB.');
    }
  }

  public getDb(dbName?: string): import('mongodb').Db {
    if (!this.client) {
      throw new Error('MongoDBWrapperV4: Not connected to MongoDB. Call connect() first.');
    }
    return this.client.db(dbName);
  }
}
