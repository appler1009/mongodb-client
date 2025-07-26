import * as index from '../index';
import { DatabaseService } from '../services/DatabaseService';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as documentPreparation from '../utils/documentPreparation';
import type { MongoQueryParams } from '../types';

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
  const mockGetAllDocuments = jest.fn();
  return {
    DatabaseService: jest.fn().mockImplementation(() => ({
      isDbActive: mockIsDbActive,
      getAllDocuments: mockGetAllDocuments,
    })),
    __esModule: true,
    mockIsDbActive,
    mockGetAllDocuments,
  };
});

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn(),
}));

jest.mock('path', () => {
  const actualPath = jest.requireActual('path');
  return {
    ...actualPath,
    join: jest.fn(),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

jest.mock('../utils/documentPreparation', () => ({
  prepareDocumentForFrontend: jest.fn(),
}));

const { mockIsDbActive, mockGetAllDocuments } = jest.requireMock('../services/DatabaseService');
const mockLogger = jest.requireMock('pino')();
const mockWriteFile = jest.requireMock('fs/promises').writeFile;
const mockTmpdir = jest.requireMock('os').tmpdir;
const mockPathJoin = jest.requireMock('path').join;
const mockUuidv4 = jest.requireMock('uuid').v4;
const mockPrepareDocumentForFrontend = jest.requireMock('../utils/documentPreparation').prepareDocumentForFrontend;

describe('exportCollectionDocuments', () => {
  const collectionName = 'testCollection';
  const params: MongoQueryParams = {
    query: '{"status":"active"}',
    sort: '{"name":1}',
  };
  const tempDir = '/tmp';
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const tempFileName = `export_${collectionName}_${uuid}.jsonl`;
  const tempFilePath = `${tempDir}/${tempFileName}`;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockIsDbActive.mockClear();
    mockGetAllDocuments.mockClear();
    mockWriteFile.mockClear();
    mockTmpdir.mockClear();
    mockPathJoin.mockClear();
    mockUuidv4.mockClear();
    mockPrepareDocumentForFrontend.mockClear();

    // Default mocks
    mockIsDbActive.mockReturnValue(true);
    mockTmpdir.mockReturnValue(tempDir);
    mockUuidv4.mockReturnValue(uuid);
    mockPathJoin.mockImplementation((...args: string[]) => args.join('/'));
    mockWriteFile.mockResolvedValue(undefined);
    mockPrepareDocumentForFrontend.mockImplementation((doc: any) => doc);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully export documents to a temporary file', async () => {
    const documents = [
      { _id: '1', name: 'Doc1', status: 'active' },
      { _id: '2', name: 'Doc2', status: 'active' },
    ];
    mockGetAllDocuments.mockResolvedValue(documents);

    const result = await index.exportCollectionDocuments(collectionName, params);

    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).toHaveBeenCalledWith(collectionName, params);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledTimes(2);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(documents[0]);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(documents[1]);
    expect(mockTmpdir).toHaveBeenCalledTimes(1);
    expect(mockUuidv4).toHaveBeenCalledTimes(1);
    expect(mockPathJoin).toHaveBeenCalledWith(tempDir, tempFileName);
    expect(mockWriteFile).toHaveBeenCalledWith(
      tempFilePath,
      `${JSON.stringify(documents[0])}\n${JSON.stringify(documents[1])}`,
      { encoding: 'utf8' }
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(result).toBe(tempFilePath);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should handle empty document list', async () => {
    mockGetAllDocuments.mockResolvedValue([]);

    const result = await index.exportCollectionDocuments(collectionName, params);

    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).toHaveBeenCalledWith(collectionName, params);
    expect(mockPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockTmpdir).toHaveBeenCalledTimes(1);
    expect(mockUuidv4).toHaveBeenCalledTimes(1);
    expect(mockPathJoin).toHaveBeenCalledWith(tempDir, tempFileName);
    expect(mockWriteFile).toHaveBeenCalledWith(tempFilePath, '', { encoding: 'utf8' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(result).toBe(tempFilePath);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should use default params when none provided', async () => {
    const documents = [{ _id: '1', name: 'Doc1' }];
    mockGetAllDocuments.mockResolvedValue(documents);

    const result = await index.exportCollectionDocuments(collectionName);

    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).toHaveBeenCalledWith(collectionName, {});
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledTimes(1);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(documents[0]);
    expect(mockTmpdir).toHaveBeenCalledTimes(1);
    expect(mockUuidv4).toHaveBeenCalledTimes(1);
    expect(mockPathJoin).toHaveBeenCalledWith(tempDir, tempFileName);
    expect(mockWriteFile).toHaveBeenCalledWith(
      tempFilePath,
      JSON.stringify(documents[0]),
      { encoding: 'utf8' }
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(`Exported NDJSON content to temporary file: ${tempFilePath}`);
    expect(result).toBe(tempFilePath);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw error if no active database connection exists', async () => {
    mockIsDbActive.mockReturnValue(false);
    const expectedError = new Error('No active database connection to export documents.');

    await expect(index.exportCollectionDocuments(collectionName, params)).rejects.toThrow(
      expectedError.message
    );

    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).not.toHaveBeenCalled();
    expect(mockPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), collectionName }),
      'Backend: Failed to export documents to temp file'
    );
    expect(mockTmpdir).not.toHaveBeenCalled();
    expect(mockUuidv4).not.toHaveBeenCalled();
    expect(mockPathJoin).not.toHaveBeenCalled();
  });

  it('should handle errors from databaseService.getAllDocuments and re-throw', async () => {
    const serviceError = new Error('Failed to fetch documents');
    mockGetAllDocuments.mockRejectedValue(serviceError);

    await expect(index.exportCollectionDocuments(collectionName, params)).rejects.toThrow(
      `Failed to export documents to temporary file for collection ${collectionName}: ${serviceError.message}`
    );

    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).toHaveBeenCalledWith(collectionName, params);
    expect(mockPrepareDocumentForFrontend).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: serviceError, collectionName }),
      'Backend: Failed to export documents to temp file'
    );
    expect(mockTmpdir).not.toHaveBeenCalled();
    expect(mockUuidv4).not.toHaveBeenCalled();
    expect(mockPathJoin).not.toHaveBeenCalled();
  });

  it('should handle errors from fs.writeFile and re-throw', async () => {
    const documents = [{ _id: '1', name: 'Doc1' }];
    mockGetAllDocuments.mockResolvedValue(documents);
    const writeError = new Error('Failed to write file');
    mockWriteFile.mockRejectedValue(writeError);

    await expect(index.exportCollectionDocuments(collectionName, params)).rejects.toThrow(
      `Failed to export documents to temporary file for collection ${collectionName}: ${writeError.message}`
    );

    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockIsDbActive).toHaveBeenCalledTimes(1);
    expect(mockGetAllDocuments).toHaveBeenCalledWith(collectionName, params);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledTimes(1);
    expect(mockPrepareDocumentForFrontend).toHaveBeenCalledWith(documents[0]);
    expect(mockTmpdir).toHaveBeenCalledTimes(1);
    expect(mockUuidv4).toHaveBeenCalledTimes(1);
    expect(mockPathJoin).toHaveBeenCalledWith(tempDir, tempFileName);
    expect(mockWriteFile).toHaveBeenCalledWith(
      tempFilePath,
      JSON.stringify(documents[0]),
      { encoding: 'utf8' }
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: writeError, collectionName }),
      'Backend: Failed to export documents to temp file'
    );
  });
});
