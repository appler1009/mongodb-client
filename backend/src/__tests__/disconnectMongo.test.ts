// src/__tests__/disconnectMongo.test.ts
import { DatabaseService } from '../services/DatabaseService';
import { disconnectMongo } from '../utils/disconnectMongo';
import {
  getActiveMongoClient,
  setActiveMongoClient,
  setActiveDb,
  setActiveConnectionId,
  setActiveDatabaseName,
  setActiveDriverVersion,
} from '../index';
import pino from 'pino';
import { MongoClient } from 'src/services/mongoDriverChooser';

type MockMongoClient = jest.Mocked<MongoClient>;

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('../index', () => {
  return {
    getActiveMongoClient: jest.fn(),
    setActiveMongoClient: jest.fn(),
    setActiveDb: jest.fn(),
    setActiveConnectionId: jest.fn(),
    setActiveDatabaseName: jest.fn(),
    setActiveDriverVersion: jest.fn(),
  }
});

const mockMongoClient = {
  close: jest.fn(),
} as unknown as MockMongoClient;

const mockLogger = jest.requireMock('pino')();
const mockIndex = jest.requireMock('../index');

describe('disconnetMongo', () => {
  let databaseService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    databaseService = new DatabaseService(mockLogger);
  });

  describe('disconnectMongo()', () => {
    it('should ignore if there is no active db', async () => {
      mockIndex.getActiveMongoClient.mockReturnValue(null);

      const result = await disconnectMongo(databaseService, mockLogger);

      expect(mockIndex.getActiveMongoClient).toHaveBeenCalledTimes(1);
      expect(mockMongoClient.close).not.toHaveBeenCalled();
      expect(mockIndex.setActiveMongoClient).not.toHaveBeenCalled();
      expect(mockIndex.setActiveDb).not.toHaveBeenCalled();
      expect(mockIndex.setActiveConnectionId).not.toHaveBeenCalled();
      expect(mockIndex.setActiveDatabaseName).not.toHaveBeenCalled();
      expect(mockIndex.setActiveDriverVersion).not.toHaveBeenCalled();
    });

    it('should disconnect from Mongo and reset all status', async () => {
      mockIndex.getActiveMongoClient.mockReturnValue(mockMongoClient);

      const result = await disconnectMongo(databaseService, mockLogger);

      expect(mockIndex.getActiveMongoClient).toHaveBeenCalledTimes(1);
      expect(mockMongoClient.close).toHaveBeenCalledTimes(1);
      expect(mockIndex.setActiveMongoClient).toHaveBeenCalledTimes(1);
      expect(mockIndex.setActiveDb).toHaveBeenCalledTimes(1);
      expect(mockIndex.setActiveConnectionId).toHaveBeenCalledTimes(1);
      expect(mockIndex.setActiveDatabaseName).toHaveBeenCalledTimes(1);
      expect(mockIndex.setActiveDriverVersion).toHaveBeenCalledTimes(1);
    });
  });
});
