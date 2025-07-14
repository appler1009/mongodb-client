// backend/src/__tests__/jest.setup.js
const { jest } = require('@jest/globals');

jest.mock('mongodb-wrapper-v6', () => ({
  MongoDBWrapperV6: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
          countDocuments: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({}),
  })),
  MongoClientV6: jest.fn(),
}));

jest.mock('mongodb-wrapper-v5', () => ({
  MongoDBWrapperV5: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
          countDocuments: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({}),
  })),
  MongoClientV5: jest.fn(),
}));

jest.mock('mongodb-wrapper-v4', () => ({
  MongoDBWrapperV4: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
          countDocuments: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({}),
  })),
  MongoClientV4: jest.fn(),
}));

jest.mock('mongodb-wrapper-v3', () => ({
  MongoDBWrapperV3: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      db: {
        databaseName: 'testdb',
        listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
          countDocuments: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })
        })
      }
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({}),
  })),
  MongoClientV3: jest.fn(),
}));
