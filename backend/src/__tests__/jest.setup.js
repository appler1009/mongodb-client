// backend/src/__tests__/jest.setup.js
const jestGlobals = require('@jest/globals');

jestGlobals.jest.mock('mongodb-wrapper-v6', () => ({
  MongoDBWrapperV6: jestGlobals.jest.fn().mockImplementation(() => ({
    connect: jestGlobals.jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
        collection: jestGlobals.jest.fn().mockReturnValue({
          find: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
          countDocuments: jestGlobals.jest.fn().mockResolvedValue(0),
          aggregate: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jestGlobals.jest.fn().mockResolvedValue(undefined),
    getClient: jestGlobals.jest.fn().mockReturnValue({}),
  })),
  MongoClientV6: jestGlobals.jest.fn(),
}));

jestGlobals.jest.mock('mongodb-wrapper-v5', () => ({
  MongoDBWrapperV5: jestGlobals.jest.fn().mockImplementation(() => ({
    connect: jestGlobals.jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
        collection: jestGlobals.jest.fn().mockReturnValue({
          find: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
          countDocuments: jestGlobals.jest.fn().mockResolvedValue(0),
          aggregate: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jestGlobals.jest.fn().mockResolvedValue(undefined),
    getClient: jestGlobals.jest.fn().mockReturnValue({}),
  })),
  MongoClientV5: jestGlobals.jest.fn(),
}));

jestGlobals.jest.mock('mongodb-wrapper-v4', () => ({
  MongoDBWrapperV4: jestGlobals.jest.fn().mockImplementation(() => ({
    connect: jestGlobals.jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
        collection: jestGlobals.jest.fn().mockReturnValue({
          find: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
          countDocuments: jestGlobals.jest.fn().mockResolvedValue(0),
          aggregate: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jestGlobals.jest.fn().mockResolvedValue(undefined),
    getClient: jestGlobals.jest.fn().mockReturnValue({}),
  })),
  MongoClientV4: jestGlobals.jest.fn(),
}));

jestGlobals.jest.mock('mongodb-wrapper-v3', () => ({
  MongoDBWrapperV3: jestGlobals.jest.fn().mockImplementation(() => ({
    connect: jestGlobals.jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
        collection: jestGlobals.jest.fn().mockReturnValue({
          find: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) }),
          countDocuments: jestGlobals.jest.fn().mockResolvedValue(0),
          aggregate: jestGlobals.jest.fn().mockReturnValue({ toArray: jestGlobals.jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jestGlobals.jest.fn().mockResolvedValue(undefined),
    getClient: jestGlobals.jest.fn().mockReturnValue({}),
  })),
  MongoClientV3: jestGlobals.jest.fn(),
}));
