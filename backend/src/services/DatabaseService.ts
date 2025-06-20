// backend/src/services/DatabaseService.ts
import { Db, Collection, Document as MongoDocument } from 'mongodb';
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

  // MODIFIED: getDocuments to accept skip and limit
  public async getDocuments(collectionName: string, limit: number, skip: number): Promise<MongoDocument[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get documents without active DB');
      throw error;
    }
    this.logger.info(`Fetching documents from collection: ${collectionName} (limit: ${limit})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      // Find all documents, limit the results, and convert to array
      const documents = await collection.find({}).skip(skip).limit(limit).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName }, 'Failed to retrieve documents from collection');
      throw error;
    }
  }

  // Method to get the total count of documents in a collection
  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.activeDb) {
      throw new Error('No active database connection.');
    }
    this.logger.info(`DatabaseService: Counting documents in collection "${collectionName}"`);
    const collection: Collection<MongoDocument> = this.activeDb.collection(collectionName);
    return await collection.countDocuments({});
  }
}
