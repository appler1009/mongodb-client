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

describe('cancelConnectionAttempt', () => {
  const testAttemptId = 'test-attempt-123';
  let mockCleanup: jest.Mock;
  let mockAbortControllerInstance: MockAbortController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    // Clear connectionAttempts using test helper
    index.__test.clearConnectionAttempts();

    mockCleanup = jest.fn().mockResolvedValue(undefined);
    mockAbortControllerInstance = new MockAbortController();
    mockAbort.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should successfully cancel an existing connection attempt with cleanup', async () => {
    index.__test.addConnectionAttempt(testAttemptId, mockAbortControllerInstance, mockCleanup);

    const result = await index.cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling abort for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling cleanup for attempt ID: ${testAttemptId}`);
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(index.__test.getConnectionAttempt(testAttemptId)).toBeUndefined();
  });

  it('should successfully cancel an existing connection attempt without cleanup', async () => {
    index.__test.addConnectionAttempt(testAttemptId, mockAbortControllerInstance);

    const result = await index.cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling abort for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling cleanup'));
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(index.__test.getConnectionAttempt(testAttemptId)).toBeUndefined();
  });

  it('should return false if no matching connection attempt is found', async () => {
    const nonExistentAttemptId = 'non-existent-id';
    const result = await index.cancelConnectionAttempt(nonExistentAttemptId);

    expect(result).toEqual({ success: false, message: 'No matching connection attempt found' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${nonExistentAttemptId}`);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling abort'));
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling cleanup'));
    expect(mockAbort).not.toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(index.__test.getConnectionAttempt(nonExistentAttemptId)).toBeUndefined();
  });

  it('should handle cleanup errors gracefully', async () => {
    const cleanupError = new Error('Cleanup failed');
    mockCleanup.mockRejectedValue(cleanupError);

    index.__test.addConnectionAttempt(testAttemptId, mockAbortControllerInstance, mockCleanup);

    const result = await index.cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(index.__test.getConnectionAttempt(testAttemptId)).toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { cleanupErr: cleanupError },
      `Error during cleanup for attempt ID: ${testAttemptId}`
    );
  });
});
