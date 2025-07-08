import { Db, Collection, Document as MongoDocument, ObjectId } from './mongoDriverChooser';
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
      query = '{}',
      sort = '{}',
      filter = '{}',
      pipeline = [],
      projection = '{}',
      collation = '{}',
      hint = '{}',
      readPreference = 'primary'
    } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get documents without active DB');
      throw error;
    }

    // Convert ISODate/ObjectId strings to MongoDB types
    const convertValue = (value: any): any => {
      if (typeof value === 'string') {
        if (/ISODate\("(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"\)/.test(value)) {
          const dateStr = value.match(/ISODate\("(.+)"\)/)?.[1];
          return dateStr ? new Date(dateStr) : value;
        }
        if (/ObjectId\("([0-9a-fA-F]{24})"\)/.test(value)) {
          const idStr = value.match(/ObjectId\("([0-9a-fA-F]{24})"\)/)?.[1];
          return idStr ? new ObjectId(idStr) : value;
        }
      }
      if (Array.isArray(value)) return value.map(convertValue);
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertValue(v)]));
      }
      return value;
    };

    // Parse stringified params
    const parsedQuery = query ? convertValue(JSON.parse(query)) : {};
    const parsedFilter = filter ? convertValue(JSON.parse(filter)) : {};
    const parsedSort = sort ? JSON.parse(sort) : {};
    const parsedPipeline = pipeline.map(stage => convertValue(JSON.parse(stage)));
    const parsedProjection = projection ? JSON.parse(projection) : {};
    const parsedCollation = collation ? JSON.parse(collation) : {};
    const parsedHint = hint ? JSON.parse(hint) : {};

    this.logger.info(`Fetching documents from collection: ${collectionName} (limit: ${limit}, skip: ${skip}, query: ${JSON.stringify(parsedQuery)}, sort: ${JSON.stringify(parsedSort)}, filter: ${JSON.stringify(parsedFilter)}, pipeline: ${JSON.stringify(parsedPipeline)}, projection: ${JSON.stringify(parsedProjection)}, collation: ${JSON.stringify(parsedCollation)}, hint: ${JSON.stringify(parsedHint)}, readPreference: ${readPreference})`);

    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      const options: any = { readPreference };

      if (parsedPipeline.length > 0) {
        const aggPipeline = [
          { $match: { ...parsedQuery, ...parsedFilter } },
          ...parsedPipeline,
          { $skip: skip },
          { $limit: limit }
        ];
        if (Object.keys(parsedSort).length > 0) {
          aggPipeline.splice(1, 0, { $sort: parsedSort });
        }
        if (Object.keys(parsedProjection).length > 0) {
          aggPipeline.push({ $project: parsedProjection });
        }
        if (Object.keys(parsedCollation).length > 0) {
          options.collation = parsedCollation;
        }
        if (Object.keys(parsedHint).length > 0) {
          options.hint = parsedHint;
        }
        const documents = await collection.aggregate(aggPipeline, options).toArray();
        this.logger.info(`Retrieved ${documents.length} documents from collection ${collectionName}`);
        this.logger.debug(JSON.stringify(documents));
        return documents;
      }

      let findQuery = collection.find({ ...parsedQuery, ...parsedFilter }, options);
      if (Object.keys(parsedSort).length > 0) {
        findQuery = findQuery.sort(parsedSort);
      }
      if (Object.keys(parsedProjection).length > 0) {
        findQuery = findQuery.project(parsedProjection);
      }
      if (Object.keys(parsedCollation).length > 0) {
        findQuery = findQuery.collation(parsedCollation);
      }
      if (Object.keys(parsedHint).length > 0) {
        findQuery = findQuery.hint(parsedHint);
      }
      const documents = await findQuery.skip(skip).limit(limit).toArray();
      this.logger.info(`Retrieved ${documents.length} documents from collection ${collectionName}`);
      this.logger.debug(JSON.stringify(documents));
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, query: parsedQuery, sort: parsedSort, filter: parsedFilter, pipeline: parsedPipeline, projection: parsedProjection, collation: parsedCollation, hint: parsedHint, readPreference }, 'Failed to retrieve documents from collection');
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
    const { query = '{}', filter = '{}' } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to count documents without active DB');
      throw error;
    }

    // Convert ISODate/ObjectId strings to MongoDB types
    const convertValue = (value: any): any => {
      if (typeof value === 'string') {
        if (/ISODate\("(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"\)/.test(value)) {
          const dateStr = value.match(/ISODate\("(.+)"\)/)?.[1];
          return dateStr ? new Date(dateStr) : value;
        }
        if (/ObjectId\("([0-9a-fA-F]{24})"\)/.test(value)) {
          const idStr = value.match(/ObjectId\("([0-9a-fA-F]{24})"\)/)?.[1];
          return idStr ? new ObjectId(idStr) : value;
        }
      }
      if (Array.isArray(value)) return value.map(convertValue);
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertValue(v)]));
      }
      return value;
    };

    // Parse stringified params
    const parsedQuery = query ? convertValue(JSON.parse(query)) : {};
    const parsedFilter = filter ? convertValue(JSON.parse(filter)) : {};

    this.logger.info(
      `DatabaseService: Counting documents in collection "${collectionName}" with query: ${JSON.stringify(parsedQuery)}, filter: ${JSON.stringify(parsedFilter)}`
    );

    try {
      const collection: Collection<MongoDocument> = this.activeDb.collection(collectionName);
      return await collection.countDocuments({ ...parsedQuery, ...parsedFilter });
    } catch (error) {
      this.logger.error(
        { error, collectionName, query: parsedQuery, filter: parsedFilter },
        `Failed to count documents in ${collectionName}`
      );
      throw error;
    }
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
      query = '{}',
      sort = '{}',
      filter = '{}',
      pipeline = [],
      projection = '{}',
      collation = '{}',
      hint = '{}',
      readPreference = 'primary'
    } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get all documents for export without active DB');
      throw error;
    }

    // Convert ISODate/ObjectId strings to MongoDB types
    const convertValue = (value: any): any => {
      if (typeof value === 'string') {
        if (/ISODate\("(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"\)/.test(value)) {
          const dateStr = value.match(/ISODate\("(.+)"\)/)?.[1];
          return dateStr ? new Date(dateStr) : value;
        }
        if (/ObjectId\("([0-9a-fA-F]{24})"\)/.test(value)) {
          const idStr = value.match(/ObjectId\("([0-9a-fA-F]{24})"\)/)?.[1];
          return idStr ? new ObjectId(idStr) : value;
        }
      }
      if (Array.isArray(value)) return value.map(convertValue);
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertValue(v)]));
      }
      return value;
    };

    // Parse stringified params
    const parsedQuery = query ? convertValue(JSON.parse(query)) : {};
    const parsedFilter = filter ? convertValue(JSON.parse(filter)) : {};
    const parsedSort = sort ? JSON.parse(sort) : {};
    const parsedPipeline = pipeline.map(stage => convertValue(JSON.parse(stage)));
    const parsedProjection = projection ? JSON.parse(projection) : {};
    const parsedCollation = collation ? JSON.parse(collation) : {};
    const parsedHint = hint ? JSON.parse(hint) : {};

    this.logger.info(`Fetching ALL documents from collection: ${collectionName} with query: ${JSON.stringify(parsedQuery)}, sort: ${JSON.stringify(parsedSort)}, filter: ${JSON.stringify(parsedFilter)}, pipeline: ${JSON.stringify(parsedPipeline)}, projection: ${JSON.stringify(parsedProjection)}, collation: ${JSON.stringify(parsedCollation)}, hint: ${JSON.stringify(parsedHint)}, readPreference: ${readPreference} for export`);

    try {
      const collection: Collection = this.activeDb.collection(collectionName);
      const options: any = { readPreference };

      if (parsedPipeline.length > 0) {
        const aggPipeline: MongoDocument[] = [
          { $match: { ...parsedQuery, ...parsedFilter } },
          ...parsedPipeline
        ];
        if (Object.keys(parsedSort).length > 0) {
          aggPipeline.push({ $sort: parsedSort as MongoDocument });
        }
        if (Object.keys(parsedProjection).length > 0) {
          aggPipeline.push({ $project: parsedProjection as MongoDocument });
        }
        if (Object.keys(parsedCollation).length > 0) {
          options.collation = parsedCollation;
        }
        if (Object.keys(parsedHint).length > 0) {
          options.hint = parsedHint;
        }
        const documents = await collection.aggregate(aggPipeline, options).toArray();
        return documents;
      }

      let findQuery = collection.find({ ...parsedQuery, ...parsedFilter }, options);
      if (Object.keys(parsedSort).length > 0) {
        findQuery = findQuery.sort(parsedSort);
      }
      if (Object.keys(parsedProjection).length > 0) {
        findQuery = findQuery.project(parsedProjection);
      }
      if (Object.keys(parsedCollation).length > 0) {
        findQuery = findQuery.collation(parsedCollation);
      }
      if (Object.keys(parsedHint).length > 0) {
        findQuery = findQuery.hint(parsedHint);
      }
      const documents = await findQuery.toArray();
      return documents;
    } catch (error) {
      this.logger.error(
        { error, collectionName, query: parsedQuery, sort: parsedSort, filter: parsedFilter, pipeline: parsedPipeline, projection: parsedProjection, collation: parsedCollation, hint: parsedHint, readPreference },
        'Failed to retrieve all documents for export from collection'
      );
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
              let type: string;
              if (value instanceof ObjectId) {
                type = 'ObjectId';
              } else if (value instanceof Date) {
                type = 'Date';
              } else if (Array.isArray(value)) {
                type = 'array';
              } else if (value === null) {
                type = 'null';
              } else if (typeof value === 'object') {
                type = 'object';
              } else {
                type = typeof value;
              }
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
        schemaSummary = `Schema for ${collectionName} (inferred from ${sampleDocuments.length} samples):\n{\n`;
        schemaMap.forEach((types, key) => {
          const typeStr = Array.from(types).join(' | ');
          schemaSummary += `  ${key}: ${typeStr}${typeStr.includes('Date') ? ' (ISODate("YYYY-MM-DDTHH:mm:ss.sssZ"))' : typeStr.includes('ObjectId') ? ' (ObjectId("24-character-hex-string"))' : ''}\n`;
        });
        schemaSummary += '}';
      } else {
        schemaSummary = `No schema could be inferred from sample documents in ${collectionName} (collection might be empty or samples invalid).`;
      }
      console.log(`Schema summary for ${collectionName}: ${schemaSummary}`);

      this.logger.debug({ schemaSummary, sampleCount: sampleDocuments.length }, 'Generated schema summary and samples.');
      return { sampleDocuments, schemaSummary };
    } catch (error: any) {
      this.logger.error({ error, collectionName }, `Failed to get schema and sample documents for ${collectionName}`);
      throw new Error(`Failed to get schema and sample documents for ${collectionName}: ${error.message}`);
    }
  }
}
