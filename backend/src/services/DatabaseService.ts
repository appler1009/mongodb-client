// backend/src/services/DatabaseService.ts
import { Db, Collection, Document as MongoDocument } from './mongoDriverChooser';
import { CollectionInfo } from '../types';
import { Logger } from 'pino';

export class DatabaseService {
  private activeDb: Db | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.activeDb = null;
  }

  public setActiveDb(db: Db | null): void {
    this.activeDb = db;
    if (db) {
      this.logger.info(`DatabaseService now operating on database: ${db.databaseName}`);
    } else {
      this.logger.info('DatabaseService active database cleared.');
    }
  }

  public isDbActive(): boolean {
    return this.activeDb !== null;
  }

  public async getCollections(): Promise<CollectionInfo[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get collections without active DB');
      throw error;
    }
    this.logger.info(`Fetching collections from database: ${this.activeDb.databaseName}`);
    try {
      const collections = await this.activeDb.listCollections().toArray();
      // Map to our simpler CollectionInfo interface
      return collections.map(c => ({ name: c.name }));
    } catch (error) {
      this.logger.error({ error }, 'Failed to list collections');
      throw error;
    }
  }

  // getDocuments to accept skip and limit
  public async getDocuments(
    collectionName: string,
    limit: number,
    skip: number,
    query: object = {}
  ): Promise<MongoDocument[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get documents without active DB');
      throw error;
    }
    this.logger.info(`Fetching documents from collection: ${collectionName} (limit: ${limit}, skip: ${skip}, query: ${JSON.stringify(query)})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      const documents = await collection.find(query).skip(skip).limit(limit).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query }, 'Failed to retrieve documents from collection with query');
      throw error;
    }
  }

  // Method to get the total count of documents in a collection
  async getDocumentCount(
    collectionName: string,
    query: object = {}
  ): Promise<number> {
    if (!this.activeDb) {
      throw new Error('No active database connection.');
    }
    this.logger.info(`DatabaseService: Counting documents in collection "${collectionName}" with query: ${JSON.stringify(query)}`);
    const collection: Collection<MongoDocument> = this.activeDb.collection(collectionName);
    return await collection.countDocuments(query);
  }

  public async getAllDocuments(collectionName: string, query: object = {}): Promise<MongoDocument[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get all documents for export without active DB');
      throw error;
    }
    this.logger.info(`Fetching ALL documents from collection: ${collectionName} with query: ${JSON.stringify(query)} for export`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      // Fetch all documents matching the query, without skip/limit
      const documents = await collection.find(query).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query }, 'Failed to retrieve all documents for export from collection');
      throw error;
    }
  }
}
