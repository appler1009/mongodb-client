import { Db, Collection, Document as MongoDocument, ObjectId, FindCursor, AggregationCursor } from './mongoDriverChooser';
import { CollectionInfo, MongoQueryParams, SchemaMap } from '../types';
import { Logger } from 'pino';
import { CollationOptions } from 'mongodb';

export class DatabaseService {
  private activeDb: Db | null = null;
  private logger: Logger;
  private schemaCache: Map<string, { schemaMap: SchemaMap; timestamp: number }> = new Map();
  private collectionsCache: { collections: CollectionInfo[]; timestamp: number } | null = null;
  private cacheTTL: number = 60 * 1000; // Cache for 60 seconds
  private collectionsCachePromise: Promise<CollectionInfo[]> | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.activeDb = null;
  }

  public setActiveDb(db: Db | null): void {
    this.activeDb = db;
    if (db) {
      this.logger.debug(`DatabaseService now operating on database: ${db.databaseName}`);
    } else {
      this.logger.debug('DatabaseService active database cleared.');
      this.schemaCache.clear();
      this.collectionsCache = null;
      this.collectionsCachePromise = null;
    }
  }

  public isDbActive(): boolean {
    return this.activeDb !== null;
  }

  public async getCollections(): Promise<CollectionInfo[]> {
    if (!this.isDbActive()) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get collections without active DB');
      throw error;
    }
    this.logger.debug(`Fetching collections from database: ${this.activeDb!.databaseName}`);

    // Check cache
    if (this.collectionsCache && Date.now() - this.collectionsCache.timestamp < this.cacheTTL) {
      this.logger.debug(`Using cached collections for database: ${this.activeDb!.databaseName}`);
      return this.collectionsCache.collections;
    }

    // If a fetch is already in progress, reuse the same promise
    if (this.collectionsCachePromise) {
      this.logger.debug(`Reusing in-progress collections fetch for database: ${this.activeDb!.databaseName}`);
      return this.collectionsCachePromise;
    }

    // Start a new fetch and cache the promise
    this.collectionsCachePromise = new Promise(async (resolve, reject) => {
      try {
        const collections = await this.activeDb!.listCollections().toArray();
        const result: CollectionInfo[] = [];
        for (const c of collections) {
          result.push({ name: c.name, documentCount: -1 });
        }
        this.collectionsCache = { collections: result, timestamp: Date.now() };
        resolve(result);
      } catch(er) {
        this.logger.error({ error: er }, 'Failed to list collections');
        reject(er);
      } finally {
        this.collectionsCachePromise = null; // Clear promise after completion
      }
    });
    return this.collectionsCachePromise;
  }

  private async buildQueryCursor(
    collectionName: string,
    params: MongoQueryParams,
    forCount: boolean = false
  ): Promise<{
    cursor?: FindCursor<MongoDocument> | AggregationCursor<MongoDocument>;
    countQuery?: MongoDocument;
  }> {
    const {
      query = '{}',
      sort = '{}',
      filter = '{}',
      pipeline = [],
      projection = '{}',
      collation = '{}',
      hint = '{}',
      readPreference = 'primary',
    } = params;

    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to build query cursor without active DB');
      throw error;
    }

    const collection: Collection = this.activeDb.collection(collectionName);

    // Check cache for schema
    const cached = this.schemaCache.get(collectionName);
    let schemaMap: SchemaMap;
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`Using cached schema for collection: ${collectionName}`);
      schemaMap = cached.schemaMap;
    } else {
      const { schemaMap: fetchedSchema } = await this.getCollectionSchemaAndSampleDocuments(collectionName);
      schemaMap = fetchedSchema;
      this.schemaCache.set(collectionName, { schemaMap, timestamp: Date.now() });
    }
    this.logger.debug(`schema map: ${JSON.stringify(schemaMap)}`);

    // Convert values to MongoDB types based on schema
    const convertValue = (value: any, field: string): any => {
      this.logger.debug(`Converting value ${JSON.stringify(value)} for field ${field}`);
      const schemaField = field.includes('.') ? field.split('.')[0] : field;
      if (typeof value === 'string' && schemaMap[schemaField] && !schemaField.startsWith('$')) {
        const fieldTypes = schemaMap[schemaField];
        if (fieldTypes.includes('Date')) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date;
            }
          } catch {
            this.logger.warn(`Failed to convert ${value} to Date for field ${schemaField}`);
          }
        } else if (fieldTypes.includes('ObjectId') && /^[0-9a-fA-F]{24}$/.test(value)) {
          try {
            return new ObjectId(value);
          } catch {
            this.logger.warn(`Failed to convert ${value} to ObjectId for field ${schemaField}`);
          }
        }
      }
      if (Array.isArray(value)) {
        return value.map(v => convertValue(v, field));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => {
            const nextField = k.startsWith('$') ? field : field ? `${field}.${k}` : k;
            return [k, convertValue(v, nextField)];
          })
        );
      }
      return value;
    };

    // Parse stringified params
    let parsedQuery, parsedFilter, parsedSort, parsedPipeline, parsedProjection, parsedCollation, parsedHint;
    try {
      parsedQuery = query ? convertValue(JSON.parse(query), '') : {};
      parsedFilter = filter ? convertValue(JSON.parse(filter), '') : {};
      parsedSort = sort ? JSON.parse(sort) : {};
      parsedPipeline = pipeline.map((stage, index) => convertValue(JSON.parse(stage), `pipeline[${index}]`));
      parsedProjection = projection ? convertValue(JSON.parse(projection), '') : {};
      parsedCollation = collation ? convertValue(JSON.parse(collation), '') : {};
      parsedHint = hint ? JSON.parse(hint) : {};
    } catch (err) {
      this.logger.error({ err, params }, 'Failed to parse query parameters');
      throw new Error('Invalid JSON in query parameters');
    }

    // Validate field types against schema, skipping MongoDB operators
    const validateField = (field: string, value: any, context: string) => {
      if (field.startsWith('$')) {
        return;
      }
      if (!schemaMap[field]) {
        this.logger.warn(`Field ${field} in ${context} not found in inferred schema for ${collectionName}`);
        return;
      }
      const expectedTypes = schemaMap[field];
      this.logger.debug(`field=${field}, value=${value}, typeof value=${typeof value}, expectedTypes=${expectedTypes}`);
      let actualType: string;
      if (value instanceof ObjectId) {
        actualType = 'ObjectId';
      } else if (value instanceof Date) {
        actualType = 'Date';
      } else if (Array.isArray(value)) {
        actualType = 'array';
      } else if (value === null) {
        actualType = 'null';
      } else if (typeof value === 'object') {
        actualType = 'object';
      } else if (typeof value === 'string' && expectedTypes.includes('ObjectId') && /^[0-9a-fA-F]{24}$/.test(value)) {
        actualType = 'ObjectId';
      } else if (typeof value === 'string' && expectedTypes.includes('Date') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
        actualType = 'Date';
      } else {
        actualType = typeof value;
      }

      if (!expectedTypes.includes(actualType)) {
        this.logger.warn(`Type mismatch for ${field} in ${context}: expected ${expectedTypes.join(' | ')}, got ${actualType}`);
      }
    };

    const validateObject = (obj: any, context: string, fieldPrefix: string = '') => {
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        // Skip ObjectId or Buffer-like objects
        if (obj instanceof ObjectId || (obj.buffer && Array.isArray(obj.buffer))) {
          const fullField = fieldPrefix || '_id'; // Default to '_id' if no prefix
          validateField(fullField, obj, context);
          return;
        }
        for (const [key, value] of Object.entries(obj)) {
          if (key.startsWith('$')) {
            continue;
          }
          const fullField = fieldPrefix ? `${fieldPrefix}.${key}` : key;
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            validateObject(value, context, fullField);
          } else {
            validateField(fullField, value, context);
          }
        }
      }
    };

    validateObject(parsedQuery, 'query');
    validateObject(parsedFilter, 'filter');
    parsedPipeline.forEach((stage, index) => validateObject(stage, `pipeline[${index}]`));
    validateObject(parsedProjection, 'projection');
    validateObject(parsedCollation, 'collation');
    validateObject(parsedHint, 'hint');
    this.logger.debug(`Validated query: ${JSON.stringify(parsedQuery)}`);
    this.logger.debug(`Validated filter: ${JSON.stringify(parsedFilter)}`);
    this.logger.debug(`Validated pipeline: ${JSON.stringify(parsedPipeline)}`);
    this.logger.debug(`Validated projection: ${JSON.stringify(parsedProjection)}`);
    this.logger.debug(`Validated collation: ${JSON.stringify(parsedCollation)}`);
    this.logger.debug(`Validated hint: ${JSON.stringify(parsedHint)}`);

    const options: any = { readPreference };

    if (forCount) {
      return { countQuery: { ...parsedQuery, ...parsedFilter } };
    }

    if (parsedPipeline.length > 0) {
      const aggPipeline = [{ $match: { ...parsedQuery, ...parsedFilter } }, ...parsedPipeline];
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
      return { cursor: collection.aggregate(aggPipeline, options) };
    }

    let findQuery = collection.find({ ...parsedQuery, ...parsedFilter }, options);
    if (Object.keys(parsedSort).length > 0) {
      findQuery = findQuery.sort(parsedSort);
    }
    if (Object.keys(parsedProjection).length > 0) {
      findQuery = findQuery.project(parsedProjection);
    }
    if (Object.keys(parsedCollation).length > 0) {
      findQuery = findQuery.collation(parsedCollation as CollationOptions);
    }
    if (Object.keys(parsedHint).length > 0) {
      findQuery = findQuery.hint(parsedHint);
    }
    return { cursor: findQuery };
  }

  public async getDocuments(
    collectionName: string,
    limit: number,
    skip: number,
    params: MongoQueryParams = {}
  ): Promise<MongoDocument[]> {
    this.logger.debug(`Fetching documents from collection: ${collectionName} (limit: ${limit}, skip: ${skip})`);
    try {
      const { cursor } = await this.buildQueryCursor(collectionName, params);
      if (!cursor) {
        throw new Error('No cursor returned from buildQueryCursor');
      }
      const documents = await cursor.skip(skip).limit(limit).toArray();
      this.logger.debug(`Retrieved ${documents.length} documents from collection ${collectionName}`);
      this.logger.debug(JSON.stringify(documents));
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, params }, 'Failed to retrieve documents from collection');
      throw error;
    }
  }

  async getDocumentCount(
    collectionName: string,
    params: MongoQueryParams = {}
  ): Promise<number> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to count documents without active DB');
      throw error;
    }

    this.logger.debug(`Counting documents in collection "${collectionName}"`);
    try {
      const { countQuery } = await this.buildQueryCursor(collectionName, params, true);
      if (!countQuery) {
        throw new Error('No count query returned from buildQueryCursor');
      }
      const collection: Collection<MongoDocument> = this.activeDb.collection(collectionName);
      return await collection.countDocuments(countQuery);
    } catch (error) {
      this.logger.error({ error, collectionName, params }, `Failed to count documents in ${collectionName}`);
      throw error;
    }
  }

  public async getAllDocuments(collectionName: string, params: MongoQueryParams = {}): Promise<MongoDocument[]> {
    this.logger.debug(`Fetching ALL documents from collection: ${collectionName} for export`);
    try {
      const { cursor } = await this.buildQueryCursor(collectionName, params);
      if (!cursor) {
        throw new Error('No cursor returned from buildQueryCursor');
      }
      const documents = await cursor.toArray();
      return documents;
    } catch (error) {
      this.logger.error({ error, collectionName, params }, 'Failed to retrieve all documents for export from collection');
      throw error;
    }
  }

  public async getCollectionSchemaAndSampleDocuments(
    collectionName: string,
    sampleCount: number = 2
  ): Promise<{ sampleDocuments: MongoDocument[]; schemaMap: SchemaMap }> {
    if (!this.activeDb) {
      const error = new Error('No active database connection.');
      this.logger.error(error, 'Attempted to get schema and samples without active DB');
      throw error;
    }

    this.logger.debug(`Fetching schema and samples for collection: ${collectionName} (sample size: ${sampleCount})`);
    try {
      const collection: Collection = this.activeDb.collection(collectionName);

      const sampleDocuments = (await collection.aggregate([
        { $sample: { size: sampleCount } }
      ]).toArray()) as MongoDocument[];
      this.logger.debug(`sample docs ${JSON.stringify(sampleDocuments)}`);

      // Get field names from a single document
      const sampleDoc = await collection.findOne();
      if (!sampleDoc) {
        this.logger.debug('No documents found in collection, returning empty schema.');
        return { sampleDocuments, schemaMap: {} };
      }
      const fields = Object.keys(sampleDoc);

      // Build aggregation pipeline to get BSON types
      const pipeline = [
        { $sample: { size: sampleCount } },
        {
          $project: Object.fromEntries(
            fields.map(key => [`${key}_type`, { $type: `$${key}` }])
          )
        },
        {
          $group: {
            _id: null,
            types: {
              $addToSet: Object.fromEntries(
                fields.map(key => [key, `$${key}_type`])
              )
            }
          }
        }
      ];

      // Execute aggregation to get types
      const result = await collection.aggregate(pipeline).toArray();
      const schemaMap: SchemaMap = {};
      result[0]?.types.forEach((typeObj: any) => {
        for (const key in typeObj) {
          let type = typeObj[key];
          if (type.toLowerCase() === 'objectid') {
            type = 'ObjectId';
          } else if (type.toLowerCase() === 'date') {
            type = 'Date';
          }
          if (!schemaMap[key]) {
            schemaMap[key] = [];
          }
          if (!schemaMap[key].includes(type)) {
            schemaMap[key].push(type);
          }
        }
      });
      this.logger.debug({ schemaMap: JSON.stringify(schemaMap), sampleCount: sampleDocuments.length },
        'Generated schema map and samples.');
      return { sampleDocuments, schemaMap };
    } catch (error: any) {
      this.logger.error({ error, collectionName }, `Failed to get schema and sample documents for ${collectionName}`);
      throw new Error(`Failed to get schema and sample documents for ${collectionName}: ${error.message}`);
    }
  }
}
