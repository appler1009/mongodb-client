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

  /**
   * Retrieves a list of all collections in the active database, including their document counts.
   * @returns {Promise<CollectionInfo[]>} An array of collection information.
   * @throws {Error} If no active database connection.
   */
  public async getCollections(): Promise<CollectionInfo[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get collections without active DB');
      throw error;
    }
    this.logger.info(`Fetching collections from database: ${this.activeDb.databaseName}`);
    try {
      const collections = await this.activeDb.listCollections().toArray();
      const result: CollectionInfo[] = [];
      for (const c of collections) {
        let documentCount = 0;
        try {
          documentCount = await this.getDocumentCount(c.name);
        } catch (err: any) {
          this.logger.warn(`Failed to get document count for ${c.name}: ${err.message}`);
        }
        result.push({ name: c.name, documentCount });
      }
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Failed to list collections');
      throw error;
    }
  }

  /**
   * Retrieves documents from a specific collection with pagination and query.
   * @param collectionName - The name of the collection.
   * @param limit - The maximum number of documents to return.
   * @param skip - The number of documents to skip.
   * @param query - The query object to filter documents.
   * @returns {Promise<MongoDocument[]>} An array of documents.
   * @throws {Error} If no active database connection.
   */
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

  /**
   * Method to get the total count of documents in a collection matching a query.
   * @param collectionName - The name of the collection.
   * @param query - The query object to filter documents for counting.
   * @returns {Promise<number>} The count of documents.
   * @throws {Error} If no active database connection.
   */
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

  /**
   * Retrieves all documents from a specific collection matching a query. Used primarily for export.
   * @param collectionName - The name of the collection.
   * @param query - The query object to filter documents.
   * @returns {Promise<MongoDocument[]>} An array of all matching documents.
   * @throws {Error} If no active database connection.
   */
  public async getAllDocuments(collectionName: string, query: object = {}): Promise<MongoDocument[]> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get all documents for export without active DB');
      throw error;
    }
    this.logger.info(`Fetching ALL documents from collection: ${collectionName} with query: ${JSON.stringify(query)} for export`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      const documents = await collection.find(query).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query }, 'Failed to retrieve all documents for export from collection');
      throw error;
    }
  }

  /**
   * Fetches a small number of sample documents and generates a basic schema summary
   * for AI query generation context.
   * @param {string} collectionName - The name of the collection.
   * @param {number} sampleCount - The number of sample documents to retrieve.
   * @returns {Promise<{ sampleDocuments: MongoDocument[]; schemaSummary: string }>} Sample documents and schema summary.
   * @throws {Error} If not connected to MongoDB.
   */
  public async getCollectionSchemaAndSampleDocuments(
    collectionName: string,
    sampleCount: number = 5
  ): Promise<{ sampleDocuments: MongoDocument[]; schemaSummary: string }> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get schema and samples without active DB');
      throw error;
    }

    this.logger.info(`Fetching schema and samples for collection: ${collectionName} (sample size: ${sampleCount})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);

      const sampleDocuments = (await collection.aggregate([
        { $sample: { size: sampleCount } }
      ]).toArray()) as MongoDocument[];

      const schemaMap: Map<string, Set<string>> = new Map();

      sampleDocuments.forEach(doc => {
        if (typeof doc === 'object' && doc !== null) {
          for (const key in doc) {
            if (Object.prototype.hasOwnProperty.call(doc, key)) {
              const value = doc[key];
              const type = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value);
              if (!schemaMap.has(key)) {
                schemaMap.set(key, new Set());
              }
              schemaMap.get(key)!.add(type);
            }
          }
        }
      });

      let schemaSummary = '';
      if (schemaMap.size > 0) {
        schemaSummary = 'Schema (inferred from samples):\n';
        schemaMap.forEach((types, key) => {
          schemaSummary += `  ${key}: ${Array.from(types).join(' | ')}\n`;
        });
      } else {
        schemaSummary = 'No schema could be inferred from sample documents (collection might be empty or samples invalid).\n';
      }

      this.logger.debug({ schemaSummary, sampleCount: sampleDocuments.length }, 'Generated schema summary and samples.');
      return { sampleDocuments, schemaSummary };
    } catch (error: any) {
      this.logger.error({ error, collectionName }, `Failed to get schema and sample documents for ${collectionName}`);
      throw new Error(`Failed to get schema and sample documents for ${collectionName}: ${error.message}`);
    }
  }
}
