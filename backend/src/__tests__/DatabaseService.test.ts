jest.mock('../services/mongoDriverChooser', () => {
  const actualMongodb = jest.requireActual('../services/mongoDriverChooser');
  const originalMongo = jest.requireActual('mongodb-wrapper-v6');
  return {
    ...actualMongodb,
    ObjectId: jest.fn((value?: string | number | Buffer | typeof actualMongodb.ObjectId) => {
        return new originalMongo.ObjectId(value);
    }),
  };
});

jest.mock('mongodb', () => {
  return {
    CollationOptions: {}
  }
});

import { Collection, Db, FindCursor, AggregationCursor, ObjectId } from '../services/mongoDriverChooser';
import { DatabaseService } from '../services/DatabaseService';
import { Logger } from 'pino';

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  silent: jest.fn(),
  level: 'debug',
  isLevelEnabled: jest.fn(() => true),
  set: jest.fn(),
  levels: {
    labels: {
      10: 'trace',
      20: 'debug',
      30: 'info',
      40: 'warn',
      50: 'error',
      60: 'fatal',
    },
    values: {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    },
  },
  version: '1.0.0',
  flush: jest.fn(),
  isLevel: jest.fn(),
  child: jest.fn(() => mockLogger),
} as unknown as Logger;

type MockFindCursor = jest.Mocked<FindCursor>;
type MockAggregationCursor = jest.Mocked<AggregationCursor>;
type MockCollection = jest.Mocked<Collection>;
type MockDb = jest.Mocked<Db>;

const mockFindCursor = {
  toArray: jest.fn(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  project: jest.fn().mockReturnThis(),
  collation: jest.fn().mockReturnThis(),
  hint: jest.fn().mockReturnThis(),
} as unknown as MockFindCursor;

const mockAggregationCursor = {
  toArray: jest.fn(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
} as unknown as MockAggregationCursor;

const mockCollection = {
  find: jest.fn(() => mockFindCursor),
  aggregate: jest.fn(() => mockAggregationCursor),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
} as unknown as MockCollection;

const mockDb = {
  databaseName: 'testdb',
  listCollections: jest.fn(),
  collection: jest.fn(() => mockCollection),
} as unknown as MockDb;

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    service = new DatabaseService(mockLogger);
    jest.clearAllMocks();
    service.setActiveDb(mockDb);
    mockAggregationCursor.toArray.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setActiveDb and isDbActive', () => {
    it('should set the active database and return true', () => {
      expect(service.isDbActive()).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('DatabaseService now operating on database: testdb');
    });

    it('should clear the active database and return false', () => {
      service.setActiveDb(null);
      expect(service.isDbActive()).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('DatabaseService active database cleared.');
    });
  });

  describe('getCollections', () => {
    it('should return cached collections if available and not expired', async () => {
      const cachedCollections = [{ name: 'cachedCollection', documentCount: -1 }];
      service['collectionsCache'] = { collections: cachedCollections, timestamp: Date.now() };

      const result = await service.getCollections();
      expect(result).toEqual(cachedCollections);
      expect(mockDb.listCollections).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached collections for database: testdb');
    });

    it('should fetch collections if cache is expired', async () => {
      const oldCollections = [{ name: 'oldCollection', documentCount: -1 }];
      service['collectionsCache'] = { collections: oldCollections, timestamp: Date.now() - service['cacheTTL'] - 1 };

      const fetchedCollections = [{ name: 'newCollection', documentCount: -1 }];
      mockDb.listCollections.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValueOnce([{ name: 'newCollection' }]),
      } as any);

      const result = await service.getCollections();
      expect(result).toEqual(fetchedCollections);
      expect(mockDb.listCollections).toHaveBeenCalled();
      expect(service['collectionsCache']?.collections).toEqual(fetchedCollections);
    });

    it('should fetch collections if no cache exists', async () => {
      mockDb.listCollections.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValueOnce([{ name: 'collection1' }, { name: 'collection2' }]),
      } as any);

      const result = await service.getCollections();
      expect(result).toEqual([{ name: 'collection1', documentCount: -1 }, { name: 'collection2', documentCount: -1 }]);
      expect(mockDb.listCollections).toHaveBeenCalled();
    });

    it('should reuse in-progress collections fetch promise', async () => {
      const promiseResult = [{ name: 'inProgress', documentCount: -1 }];
      mockDb.listCollections.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValueOnce([{ name: 'inProgress' }]),
      } as any);

      const promise1 = service.getCollections();
      const promise2 = service.getCollections();

      await expect(promise1).resolves.toEqual(promiseResult);
      await expect(promise2).resolves.toEqual(promiseResult);
      expect(mockDb.listCollections).toHaveBeenCalledTimes(1); // Should only be called once
      expect(mockLogger.debug).toHaveBeenCalledWith('Reusing in-progress collections fetch for database: testdb');
    });

    it('should throw an error if no active database connection', async () => {
      service.setActiveDb(null);
      await expect(service.getCollections()).rejects.toThrow('No active database connection.');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(Error), 'Attempted to get collections without active DB');
    });

    it('should handle errors during collection listing', async () => {
      const mockError = new Error('Network error');
      mockDb.listCollections.mockReturnValueOnce({
        toArray: jest.fn().mockRejectedValueOnce(mockError),
      } as any);

      await expect(service.getCollections()).rejects.toThrow('Network error');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: mockError }, 'Failed to list collections');
    });
  });

  describe('getDocuments', () => {
    it('should retrieve documents with limit and skip', async () => {
      const documents = [{ _id: new ObjectId(), field: 'value1' }, { _id: new ObjectId(), field: 'value2' }];
      mockFindCursor.toArray.mockResolvedValueOnce(documents);

      const collectionName = 'testCollection';
      const limit = 10;
      const skip = 0;
      const params = { query: '{"field": "value1"}' };

      const result = await service.getDocuments(collectionName, limit, skip, params);

      expect(mockDb.collection).toHaveBeenCalledWith(collectionName);
      expect(mockCollection.find).toHaveBeenCalled(); // This is called without arguments initially
      expect(mockFindCursor.skip).toHaveBeenCalledWith(skip);
      expect(mockFindCursor.limit).toHaveBeenCalledWith(limit);
      expect(mockFindCursor.toArray).toHaveBeenCalled();
      expect(result).toEqual(documents);
      expect(mockLogger.debug).toHaveBeenCalledWith(`Fetching documents from collection: ${collectionName} (limit: ${limit}, skip: ${skip})`);
      expect(mockLogger.debug).toHaveBeenCalledWith(`Retrieved ${documents.length} documents from collection ${collectionName}`);
    });

    it('should throw an error if buildQueryCursor returns no cursor', async () => {
      jest.spyOn(service as any, 'buildQueryCursor').mockResolvedValueOnce({});
      await expect(service.getDocuments('testCollection', 10, 0)).rejects.toThrow('No cursor returned from buildQueryCursor');
    });

    it('should handle errors during document retrieval', async () => {
      const mockError = new Error('DB Read Error');
      mockFindCursor.toArray.mockRejectedValueOnce(mockError);

      await expect(service.getDocuments('testCollection', 10, 0)).rejects.toThrow('DB Read Error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ error: mockError }), 'Failed to retrieve documents from collection');
    });

    it('should pass correct query and filter to find', async () => {
      const documents = [{ _id: new ObjectId(), field: 'value1' }];
      mockFindCursor.toArray.mockResolvedValueOnce(documents);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string-' }] },
      ]);

      const params = { query: '{"field": "value"}' };
      await service.getDocuments('testCollection', 1, 0, params);

      const expectedQuery = { field: 'value' };
      expect(mockCollection.aggregate).toHaveBeenCalledTimes(2);
      expect(mockCollection.find).toHaveBeenCalledWith(expectedQuery, expect.any(Object));
    });

    it('should apply sort, projection, collation, and hint for find queries', async () => {
      const documents = [{ _id: new ObjectId(), field: 'value1' }];
      mockFindCursor.toArray.mockResolvedValueOnce(documents);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]);

      const params = {
        query: '{}',
        sort: '{"field": 1}',
        projection: '{"_id": 0}',
        collation: '{"locale": "en"}',
        hint: '{"_id": 1}',
      };

      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockCollection.find).toHaveBeenCalledWith({}, { readPreference: 'primary' });
      expect(mockFindCursor.sort).toHaveBeenCalledWith({ field: 1 });
      expect(mockFindCursor.project).toHaveBeenCalledWith({ _id: 0 });
      expect(mockFindCursor.collation).toHaveBeenCalledWith({ locale: 'en' });
      expect(mockFindCursor.hint).toHaveBeenCalledWith({ _id: 1 });
    });

    it('should apply pipeline for aggregate queries', async () => {
      const documents = [{ _id: new ObjectId(), field: 'value1' }];
      mockAggregationCursor.toArray.mockResolvedValueOnce(documents);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]);

      const params = {
        query: '{"status": "active"}',
        pipeline: ['{"$group": {"_id": "$category"}}'],
        sort: '{"_id": 1}',
        projection: '{"_id": 1}',
        collation: '{"locale": "en"}',
        hint: '{"_id": 1}',
      };

      await service.getDocuments('testCollection', 1, 0, params);

      const expectedPipeline = [
        { $match: { status: 'active' } },
        { $sort: { _id: 1 } },
        { $group: { _id: '$category' } },
        { $project: { _id: 1 } }
      ];

      expect(mockCollection.aggregate).toHaveBeenCalledWith(expectedPipeline, { readPreference: 'primary', collation: { locale: 'en' }, hint: { _id: 1 } });
      expect(mockAggregationCursor.skip).toHaveBeenCalledWith(0);
      expect(mockAggregationCursor.limit).toHaveBeenCalledWith(1);
      expect(mockAggregationCursor.toArray).toHaveBeenCalled();
    });
  });

  describe('getDocumentCount', () => {
    it('should return the count of documents', async () => {
      const collectionName = 'testCollection';
      const expectedCount = 5;
      mockCollection.countDocuments.mockResolvedValueOnce(expectedCount);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]);

      const params = { query: '{"status": "active"}' };
      const result = await service.getDocumentCount(collectionName, params);

      expect(mockDb.collection).toHaveBeenCalledWith(collectionName);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toBe(expectedCount);
      expect(mockLogger.debug).toHaveBeenCalledWith(`Counting documents in collection "${collectionName}"`);
    });

    it('should throw an error if no active database connection', async () => {
      service.setActiveDb(null);
      await expect(service.getDocumentCount('testCollection')).rejects.toThrow('No active database connection.');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(Error), 'Attempted to count documents without active DB');
    });

    it('should throw an error if buildQueryCursor returns no countQuery', async () => {
      jest.spyOn(service as any, 'buildQueryCursor').mockResolvedValueOnce({});
      await expect(service.getDocumentCount('testCollection')).rejects.toThrow('No count query returned from buildQueryCursor');
    });

    it('should handle errors during document counting', async () => {
      const mockError = new Error('Count Error');
      mockCollection.countDocuments.mockRejectedValueOnce(mockError);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]);

      await expect(service.getDocumentCount('testCollection')).rejects.toThrow('Count Error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ error: mockError }), 'Failed to count documents in testCollection');
    });
  });

  describe('getAllDocuments', () => {
    it('should retrieve all documents for export', async () => {
      const documents = [{ _id: new ObjectId(), field: 'value1' }, { _id: new ObjectId(), field: 'value2' }];
      mockFindCursor.toArray.mockResolvedValueOnce(documents);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), schemaField: 'test' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ schemaField: 'string' }] },
      ]);

      const collectionName = 'testCollection';
      const result = await service.getAllDocuments(collectionName);

      expect(mockDb.collection).toHaveBeenCalledWith(collectionName);
      expect(mockCollection.find).toHaveBeenCalledWith({}, expect.any(Object));
      expect(mockFindCursor.toArray).toHaveBeenCalled();
      expect(result).toEqual(documents);
      expect(mockLogger.debug).toHaveBeenCalledWith(`Fetching ALL documents from collection: ${collectionName} for export`);
    });

    it('should throw an error if buildQueryCursor returns no cursor', async () => {
      jest.spyOn(service as any, 'buildQueryCursor').mockResolvedValueOnce({});
      await expect(service.getAllDocuments('testCollection')).rejects.toThrow('No cursor returned from buildQueryCursor');
    });

    it('should handle errors during all document retrieval', async () => {
      const mockError = new Error('Export Error');
      mockFindCursor.toArray.mockRejectedValueOnce(mockError);

      await expect(service.getAllDocuments('testCollection')).rejects.toThrow('Export Error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ error: mockError }), 'Failed to retrieve all documents for export from collection');
    });
  });

  describe('getCollectionSchemaAndSampleDocuments', () => {
    it('should return sample documents and schema map', async () => {
      const sampleDocs = [{ _id: new ObjectId('60c7281f68e0a3001c3d9a1f'), name: 'Test', age: 30, createdAt: new Date() }];
      mockAggregationCursor.toArray.mockResolvedValueOnce(sampleDocs);
      mockCollection.findOne.mockResolvedValueOnce(sampleDocs[0]);
      mockAggregationCursor.toArray.mockResolvedValueOnce([{
        _id: null,
        types: [{
          _id: 'objectId',
          name: 'string',
          age: 'int',
          createdAt: 'date'
        }]
      }]);

      const { sampleDocuments, schemaMap } = await service.getCollectionSchemaAndSampleDocuments('testCollection');

      expect(mockDb.collection).toHaveBeenCalledWith('testCollection');
      expect(mockCollection.aggregate).toHaveBeenCalledTimes(2); // One for $sample, one for $project/$group
      expect(sampleDocuments).toEqual(sampleDocs);
      expect(schemaMap).toEqual({
        _id: ['ObjectId'],
        name: ['string'],
        age: ['int'],
        createdAt: ['Date'],
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Fetching schema and samples for collection: testCollection'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.objectContaining({ schemaMap: expect.any(String), sampleCount: sampleDocs.length }), 'Generated schema map and samples.');
    });

    it('should handle collection with no documents for schema generation', async () => {
      mockCollection.findOne.mockResolvedValueOnce(null);
      mockAggregationCursor.toArray.mockResolvedValueOnce([]); // No sample docs
      mockAggregationCursor.toArray.mockResolvedValueOnce([]); // No types

      const { sampleDocuments, schemaMap } = await service.getCollectionSchemaAndSampleDocuments('emptyCollection');

      expect(sampleDocuments).toEqual([]);
      expect(schemaMap).toEqual({});
      expect(mockLogger.debug).toHaveBeenCalledWith('No documents found in collection, returning empty schema.');
    });

    it('should throw an error if no active database connection', async () => {
      service.setActiveDb(null);
      await expect(service.getCollectionSchemaAndSampleDocuments('testCollection')).rejects.toThrow('No active database connection.');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(Error), 'Attempted to get schema and samples without active DB');
    });

    it('should handle errors during schema and sample retrieval', async () => {
      const mockError = new Error('Schema Error');
      mockCollection.findOne.mockRejectedValueOnce(mockError);

      await expect(service.getCollectionSchemaAndSampleDocuments('testCollection')).rejects.toThrow('Failed to get schema and sample documents for testCollection: Schema Error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ error: mockError }), 'Failed to get schema and sample documents for testCollection');
    });

    it.skip('should use cached schema if available and not expired', async () => {
      const cachedSchema = {
        _id: ['ObjectId'],
        field1: ['string'],
      };
      service['schemaCache'].set('cachedCollection', { schemaMap: cachedSchema, timestamp: Date.now() });

      const { schemaMap } = await service.getCollectionSchemaAndSampleDocuments('cachedCollection');
      expect(schemaMap).toEqual(cachedSchema);
      expect(mockCollection.findOne).not.toHaveBeenCalled();
      expect(mockCollection.aggregate).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached schema for collection: cachedCollection');
    });

    it('should parse and convert ObjectId in query parameters', async () => {
      const objectId = new ObjectId();
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), field: 'value' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', field: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', field: 'string' }] },
      ]);

      const params = { query: `{"_id": "${objectId.toHexString()}"}` };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockCollection.find).toHaveBeenCalledWith({ _id: objectId }, expect.any(Object));
    });

    it('should parse and convert Date in query parameters', async () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), createdAt: date });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', createdAt: 'date' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', createdAt: 'date' }] },
      ]);

      const params = { query: `{"createdAt": "${date.toISOString()}"}` };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockCollection.find).toHaveBeenCalledWith({ createdAt: date }, expect.any(Object));
    });

    it('should parse and convert nested ObjectId in query parameters', async () => {
      const objectId = new ObjectId();
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), 'nested.id': objectId });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', nested: 'object' }] },
      ]); // Mock schema only for top-level 'nested'
      service['schemaCache'].set('testCollection', {
        schemaMap: {
          '_id': ['ObjectId'],
          'nested.id': ['ObjectId']
        }, timestamp: Date.now()
      });


      const params = { query: `{"nested.id": "${objectId.toHexString()}"}` };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockCollection.find).toHaveBeenCalledWith({ 'nested.id': objectId.toString() }, expect.any(Object));
    });

    it('should not convert string if schema type does not match', async () => {
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), stringField: '123' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', stringField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', stringField: 'string' }] },
      ]);

      const params = { query: '{"stringField": "123"}' };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockCollection.find).toHaveBeenCalledWith({ stringField: '123' }, expect.any(Object));
    });

    it('should log warning for type mismatch in query parameters', async () => {
      const invalidObjectId = 'invalid-id';
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), objectIdField: new ObjectId() });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', objectIdField: 'objectId' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', objectIdField: 'objectId' }] },
      ]);

      const params = { query: `{"objectIdField": "${invalidObjectId}"}` };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockLogger.warn).toHaveBeenCalledWith(`Type mismatch for objectIdField in query: expected ObjectId, got ${typeof invalidObjectId}`);
    });

    it('should throw error for invalid JSON in query parameters', async () => {
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), stringField: '123' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', stringField: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', stringField: 'string' }] },
      ]);

      const params = { query: '{"field": invalid}' };
      await expect(service.getDocuments('testCollection', 1, 0, params)).rejects.toThrow('Invalid JSON in query parameters');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'Failed to parse query parameters');
    });

    it('should log warning if field in query not in inferred schema', async () => {
      mockFindCursor.toArray.mockResolvedValueOnce([]);
      mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(), field1: 'value' });
      mockAggregationCursor.toArray.mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', field1: 'string' }] },
      ]).mockResolvedValueOnce([
        { _id: null, types: [{ _id: 'objectId', field1: 'string' }] },
      ]);

      const params = { query: '{"nonExistentField": "value"}' };
      await service.getDocuments('testCollection', 1, 0, params);

      expect(mockLogger.warn).toHaveBeenCalledWith('Field nonExistentField in query not found in inferred schema for testCollection');
    });
  });
});
