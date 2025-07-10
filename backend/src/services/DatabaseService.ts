import { Db, Collection, Document as MongoDocument, ObjectId, FindCursor, AggregationCursor } from './mongoDriverChooser';
import { CollectionInfo, MongoQueryParams, SchemaMap } from '../types';
import { Logger } from 'pino';
import { CollationOptions } from 'mongodb';

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

    // Fetch schema to use for type conversion and validation
    const { schemaMap } = await this.getCollectionSchemaAndSampleDocuments(collectionName, 5);
    this.logger.debug(`schema map: ${JSON.stringify(schemaMap)}`);

    // Convert values to MongoDB types based on schema
    const convertValue = (value: any, field: string): any => {
      this.logger.debug(`Converting value ${JSON.stringify(value)} for field ${field}`);
      // Use the parent field for schema lookup if the current field is an operator
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
            // For operator keys, keep the parent field; for non-operator keys, use the current key
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
      parsedHint = hint ? convertValue(JSON.parse(hint), '') : {};
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
      let actualType: string;
      if (value instanceof ObjectId) actualType = 'ObjectId';
      else if (value instanceof Date) actualType = 'Date';
      else if (Array.isArray(value)) actualType = 'array';
      else if (value === null) actualType = 'null';
      else if (typeof value === 'object') actualType = 'object';
      else actualType = typeof value;

      if (!expectedTypes.includes(actualType)) {
        this.logger.warn(`Type mismatch for ${field} in ${context}: expected ${expectedTypes.join(' | ')}, got ${actualType}`);
      }
    };

    const validateObject = (obj: any, context: string, fieldPrefix: string = '') => {
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
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
    this.logger.info(`Fetching ALL documents from collection: ${collectionName} for export`);
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
    sampleCount: number = 5
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

      const schemaMap: SchemaMap = {};
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
              if (!schemaMap[key]) {
                schemaMap[key] = [];
              }
              if (!schemaMap[key].includes(type)) {
                schemaMap[key].push(type);
              }
            }
          }
        }
      });

      this.logger.debug({ schemaMap, sampleCount: sampleDocuments.length }, 'Generated schema map and samples.');
      return { sampleDocuments, schemaMap };
    } catch (error: any) {
      this.logger.error({ error, collectionName }, `Failed to get schema and sample documents for ${collectionName}`);
      throw new Error(`Failed to get schema and sample documents for ${collectionName}: ${error.message}`);
    }
  }
}
