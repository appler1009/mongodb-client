import * as index from '../index';
import pino from 'pino';

jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

const mockAbort = jest.fn();
class MockAbortController {
  signal: any;
  constructor() {
    this.signal = {};
  }
  abort = mockAbort;
}
global.AbortController = MockAbortController as any;

const mockLogger = jest.requireMock('pino')();

describe('cancelQuery', () => {
  const testQueryId = 'test-query-123';
  let mockAbortControllerInstance: MockAbortController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    // Clear queryAttempts using test helper
    index.__test.clearQueryAttempts();

    mockAbortControllerInstance = new MockAbortController();
    mockAbort.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully cancel an existing query attempt', async () => {
    index.__test.addQueryAttempt(testQueryId, mockAbortControllerInstance);

    const result = await index.cancelQuery(testQueryId);

    expect(result).toEqual({ success: true, message: 'Query cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for query ID: ${testQueryId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling abort for query ID: ${testQueryId}`);
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(index.__test.getQueryAttempt(testQueryId)).toBeUndefined();
  });

  it('should return false if no matching query attempt is found', async () => {
    const nonExistentQueryId = 'non-existent-id';
    const result = await index.cancelQuery(nonExistentQueryId);

    expect(result).toEqual({ success: false, message: 'No matching query attempt found' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for query ID: ${nonExistentQueryId}`);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling abort'));
    expect(mockAbort).not.toHaveBeenCalled();
    expect(index.__test.getQueryAttempt(nonExistentQueryId)).toBeUndefined();
  });
});