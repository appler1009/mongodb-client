import { Db, Collection, Document as MongoDocument } from './mongoDriverChooser';
import { CollectionInfo, MongoQueryParams } from '../types';
import { Logger } from 'pino';
import { CollationOptions, Sort } from 'mongodb';

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
   * Retrieves documents from a specific collection with pagination and advanced query options.
   * @param collectionName - The name of the collection.
   * @param limit - The maximum number of documents to return.
   * @param skip - The number of documents to skip.
   * @param params - Query parameters including query, sort, filter, pipeline, projection, collation, hint, and readPreference.
   * @returns {Promise<MongoDocument[]>} An array of documents.
   * @throws {Error} If no active database connection.
   */
  public async getDocuments(
    collectionName: string,
    limit: number,
    skip: number,
    params: MongoQueryParams = {}
  ): Promise<MongoDocument[]> {
    const {
      query = {},
      sort = {},
      filter = {},
      pipeline = [],
      projection = {},
      collation = {},
      hint = {},
      readPreference = 'primary'
    } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get documents without active DB');
      throw error;
    }
    this.logger.info(`Fetching documents from collection: ${collectionName} (limit: ${limit}, skip: ${skip}, query: ${JSON.stringify(query)}, sort: ${JSON.stringify(sort)}, filter: ${JSON.stringify(filter)}, pipeline: ${JSON.stringify(pipeline)}, projection: ${JSON.stringify(projection)}, collation: ${JSON.stringify(collation)}, hint: ${JSON.stringify(hint)}, readPreference: ${readPreference})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);

      // Set read preference
      const options: any = { readPreference };

      // If an aggregation pipeline is provided, use aggregation
      if (pipeline.length > 0) {
        const aggPipeline = [
          { $match: { ...query, ...filter } },
          ...pipeline,
          { $skip: skip },
          { $limit: limit }
        ];
        if (Object.keys(sort).length > 0) {
          aggPipeline.splice(1, 0, { $sort: sort });
        }
        if (Object.keys(projection).length > 0) {
          aggPipeline.push({ $project: projection });
        }
        if (Object.keys(collation).length > 0) {
          options.collation = collation;
        }
        if (Object.keys(hint).length > 0) {
          options.hint = hint;
        }
        const documents = await collection.aggregate(aggPipeline, options).toArray();
        return documents;
      }

      // Standard find with query, sort, filter, and advanced options
      let findQuery = collection.find({ ...query, ...filter }, options);
      if (Object.keys(sort).length > 0) {
        findQuery = findQuery.sort(sort);
      }
      if (Object.keys(projection).length > 0) {
        findQuery = findQuery.project(projection);
      }
      if (Object.keys(collation).length > 0) {
        findQuery = findQuery.collation(collation as CollationOptions);
      }
      if (Object.keys(hint).length > 0) {
        findQuery = findQuery.hint(hint);
      }
      const documents = await findQuery.skip(skip).limit(limit).toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query, sort, filter, pipeline, projection, collation, hint, readPreference }, 'Failed to retrieve documents from collection');
      throw error;
    }
  }

  /**
   * Method to get the total count of documents in a collection matching query and filter.
   * @param collectionName - The name of the collection.
   * @param params - Query parameters including query and filter.
   * @returns {Promise<number>} The count of documents.
   * @throws {Error} If no active database connection.
   */
  async getDocumentCount(
    collectionName: string,
    params: MongoQueryParams = {}
  ): Promise<number> {
    const { query = {}, filter = {} } = params;

    if (!this.activeDb) {
      throw new Error('No active database connection.');
    }
    this.logger.info(`DatabaseService: Counting documents in collection "${collectionName}" with query: ${JSON.stringify(query)}, filter: ${JSON.stringify(filter)}`);
    const collection: Collection<MongoDocument> = this.activeDb.collection(collectionName);
    return await collection.countDocuments({ ...query, ...filter });
  }

  /**
   * Retrieves all documents from a specific collection with advanced query options. Used primarily for export.
   * @param collectionName - The name of the collection.
   * @param params - Query parameters including query, sort, filter, pipeline, projection, collation, hint, and readPreference.
   * @returns {Promise<MongoDocument[]>} An array of all matching documents.
   * @throws {Error} If no active database connection.
   */
  public async getAllDocuments(collectionName: string, params: MongoQueryParams = {}): Promise<MongoDocument[]> {
    const {
      query = {},
      sort = {},
      filter = {},
      pipeline = [],
      projection = {},
      collation = {},
      hint = {},
      readPreference = 'primary'
    } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get all documents for export without active DB');
      throw error;
    }
    this.logger.info(`Fetching ALL documents from collection: ${collectionName} with query: ${JSON.stringify(query)}, sort: ${JSON.stringify(sort)}, filter: ${JSON.stringify(filter)}, pipeline: ${JSON.stringify(pipeline)}, projection: ${JSON.stringify(projection)}, collation: ${JSON.stringify(collation)}, hint: ${JSON.stringify(hint)}, readPreference: ${readPreference} for export`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);

      // Set read preference
      const options: any = { readPreference };

      // If an aggregation pipeline is provided, use aggregation
      if (pipeline.length > 0) {
        const aggPipeline = [
          { $match: { ...query, ...filter } },
          ...pipeline
        ];
        if (Object.keys(sort).length > 0) {
          aggPipeline.push({ $sort: sort });
        }
        if (Object.keys(projection).length > 0) {
          aggPipeline.push({ $project: projection });
        }
        if (Object.keys(collation).length > 0) {
          options.collation = collation;
        }
        if (Object.keys(hint).length > 0) {
          options.hint = hint;
        }
        const documents = await collection.aggregate(aggPipeline, options).toArray();
        return documents;
      }

      // Standard find with query, sort, filter, and advanced options
      let findQuery = collection.find({ ...query, ...filter }, options);
      if (Object.keys(sort).length > 0) {
        findQuery = findQuery.sort(sort as Sort);
      }
      if (Object.keys(projection).length > 0) {
        findQuery = findQuery.project(projection);
      }
      if (Object.keys(collation).length > 0) {
        findQuery = findQuery.collation(collation as CollationOptions);
      }
      if (Object.keys(hint).length > 0) {
        findQuery = findQuery.hint(hint);
      }
      const documents = await findQuery.toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query, sort, filter, pipeline, projection, collation, hint, readPreference }, 'Failed to retrieve all documents for export from collection');
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
