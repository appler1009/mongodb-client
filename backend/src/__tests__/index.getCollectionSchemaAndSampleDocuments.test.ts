import * as index from '../index';
import { DatabaseService } from '../services/DatabaseService';
import pino from 'pino';
import * as documentPreparation from '../utils/documentPreparation';
import type { Document, SchemaMap } from '../types';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

jest.mock('../services/DatabaseService', () => {
  const mockIsDbActive = jest.fn();
  const mockGetCollectionSchemaAndSampleDocuments = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getCollectionSchemaAndSampleDocuments: mockGetCollectionSchemaAndSampleDocuments,
    })),
    __esModule: true,
    mockIsDbActive,
    mockGetCollectionSchemaAndSampleDocuments,
  };
});

jest.mock('../utils/documentPreparation', () => ({
  prepareDocumentForFrontend: jest.fn(),
}));

const { mockIsDbActive, mockGetCollectionSchemaAndSampleDocuments } = jest.requireMock('../services/DatabaseService');
const mockLogger = jest.requireMock('pino')();
const mockPrepareDocumentForFrontend = jest.requireMock('../utils/documentPreparation').prepareDocumentForFrontend;

describe('getCollectionSchemaAndSampleDocuments', () => {
  const collectionName = 'testCollection';
  const sampleCount = 2;
  const sampleDocuments: Document[] = [
    { _id: '1', name: 'Doc1', status: 'active' },
    { _id: '2', name: 'Doc2', status: 'active' },
  ];
  const schemaMap: SchemaMap = {
    _id: ['string'],
    name: ['string'],
    status: ['string'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockIsDbActive.mockClear();
    mockGetCollectionSchemaAndSampleDocuments.mockClear();
    mockPrepareDocumentForFrontend.mockClear();

    // Default mocks
    mockIsDbActive.mockReturnValue(true);
    mockGetCollectionSchemaAndSampleDocuments.mockResolvedValue({ sampleDocuments, schemaMap });
    mockPrepareDocumentForFrontend.mockImplementation((doc: Document) => doc);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully fetch schema map and sample documents', async () => {
    const result = await index.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollectionSchemaAndSampleDocuments).toHaveBeenCalledWith(collectionName, sampleCount);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledTimes(2);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(sampleDocuments[0], 0, sampleDocuments);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(sampleDocuments[1], 1, sampleDocuments);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { collectionName, sampleCount, schemaMapSize: Object.keys(schemaMap).length },
      'IPC: Fetched schema map and sample documents for Query Helper.'
    );
    expect(result).toEqual({ sampleDocuments, schemaMap });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should use default sampleCount when none provided', async () => {
    const result = await index.getCollectionSchemaAndSampleDocuments(collectionName);

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollectionSchemaAndSampleDocuments).toHaveBeenCalledWith(collectionName, 2);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledTimes(2);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(sampleDocuments[0], 0, sampleDocuments);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(sampleDocuments[1], 1, sampleDocuments);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { collectionName, sampleCount: 2, schemaMapSize: Object.keys(schemaMap).length },
      'IPC: Fetched schema map and sample documents for Query Helper.'
    );
    expect(result).toEqual({ sampleDocuments, schemaMap });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedDbActive = new Error('No active database connection to get schema and samples.');

    await expect(index.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount)).rejects.toThrow(
      expectedDbActive.message
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollectionSchemaAndSampleDocuments).not.toHaveBeenCalled();
    expect(mockPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), collectionName }),
      'IPC: Failed to get schema and sample documents for Query Helper'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getCollectionSchemaAndSampleDocuments and re-throw', async () => {
    const serviceError = new Error('Failed to fetch schema and samples');
    mockGetCollectionSchemaAndSampleDocuments.mockRejectedValue(serviceError);

    await expect(index.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount)).rejects.toThrow(
      `Failed to get schema and sample documents for Query Helper: ${serviceError.message}`
    );

    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetCollectionSchemaAndSampleDocuments).toHaveBeenCalledWith(collectionName, sampleCount);
    expect(mockPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: serviceError, collectionName }),
      'IPC: Failed to get schema and sample documents for Query Helper'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
