// backend/src/services/DatabaseService.ts
import { Db, Collection } from 'mongodb';
import { CollectionInfo } from '../types';
import { Logger } from 'pino';

export class DatabaseService {
  private activeDb: Db | null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.activeDb = null; // This will be set externally by server.ts
  }

  // Method to set the active database instance
  public setActiveDb(db: Db | null): void {
    this.activeDb = db;
    if (db) {
      this.logger.info(`DatabaseService now operating on database: ${db.databaseName}`);
    } else {
      this.logger.info('DatabaseService active database cleared.');
    }
  }

  // Check if a database connection is active
  public isDbActive(): boolean {
    return this.activeDb !== null;
  }

  // Get a list of collection names in the active database
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

  // Get documents from a specific collection
  public async getDocuments(collectionName: string, limit: number = 20): Promise<any[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get documents without active DB');
      throw error;
    }
    this.logger.info(`Fetching documents from collection: ${collectionName} (limit: ${limit})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      // Find all documents, limit the results, and convert to array
      const documents = await collection.find({}).limit(limit).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName }, 'Failed to retrieve documents from collection');
      throw error;
    }
  }

  // Optional: Add methods for CRUD operations on documents if needed later
  // public async insertDocument(collectionName: string, document: any): Promise<any> { ... }
  // public async updateDocument(collectionName: string, query: any, update: any): Promise<any> { ... }
  // public async deleteDocument(collectionName: string, query: any): Promise<any> { ... }
}
