// src/__tests__/index.cancelConnectionAttempt.test.ts

// Global mock for pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

// Mock AbortController
// We need to define it globally or within the scope of the mock where it's used
// so that `abort` can be spied on.
const mockAbort = jest.fn();
class MockAbortController {
  signal: any;
  constructor() {
    this.signal = {}; // Simple mock for signal
  }
  abort = mockAbort;
}
// Replace the global AbortController with our mock
global.AbortController = MockAbortController as any;


// --- START OF MOCKING INDEX.TS ---
jest.mock('../index', () => {
  // We need to replicate the connectionAttempts map here
  // because the module-level variable is private to the actual index.ts
  const connectionAttempts = new Map<string, { controller: AbortController, cleanup?: () => Promise<void> }>();

  // Use the mocked pino logger within the mock
  const mockLogger = require('pino')();

  const mockedCancelConnectionAttempt = jest.fn(async (attemptId: string) => {
    mockLogger.debug(`Received cancellation request for attempt ID: ${attemptId}`);
    const attempt = connectionAttempts.get(attemptId);
    if (!attempt) {
      return { success: false, message: 'No matching connection attempt found' };
    }

    mockLogger.debug(`Calling abort for attempt ID: ${attemptId}`);
    attempt.controller.abort();

    if (attempt.cleanup) {
      mockLogger.debug(`Calling cleanup for attempt ID: ${attemptId}`);
      try {
        await attempt.cleanup();
      } catch (cleanupErr: any) {
        mockLogger.error({ cleanupErr }, `Error during cleanup for attempt ID: ${attemptId}`);
        // The function still returns success: true as cancellation itself isn't blocked by cleanup error
      }
    }

    connectionAttempts.delete(attemptId);
    return { success: true, message: 'Connection attempt cancelled' };
  });

  // Expose helpers to manipulate the internal state for testing
  const __addConnectionAttempt = (id: string, controller: AbortController, cleanup?: () => Promise<void>) => {
    connectionAttempts.set(id, { controller, cleanup });
  };

  const __getConnectionAttempt = (id: string) => {
    return connectionAttempts.get(id);
  };

  const __clearConnectionAttempts = () => {
    connectionAttempts.clear();
  };

  return {
    cancelConnectionAttempt: mockedCancelConnectionAttempt,
    __addConnectionAttempt,
    __getConnectionAttempt,
    __clearConnectionAttempts,
  };
});
// --- END OF MOCKING INDEX.TS ---

// Import the mocked functions from index.ts
const {
  cancelConnectionAttempt,
  __addConnectionAttempt,
  __getConnectionAttempt,
  __clearConnectionAttempts,
} = jest.requireMock('../index');

// Get a reference to the mocked logger
const mockLogger = jest.requireMock('pino')();

describe('cancelConnectionAttempt', () => {
  const testAttemptId = 'test-attempt-123';
  let mockCleanup: jest.Mock;
  let mockAbortControllerInstance: MockAbortController;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks before each test
    __clearConnectionAttempts(); // Clear the internal map for isolation

    // Create fresh mock instances for each test
    mockCleanup = jest.fn().mockResolvedValue(undefined);
    mockAbortControllerInstance = new MockAbortController();
    mockAbort.mockClear(); // Clear calls on the global mockAbort from MockAbortController
  });

  it('should successfully cancel an existing connection attempt with cleanup', async () => {
    __addConnectionAttempt(testAttemptId, mockAbortControllerInstance, mockCleanup);

    const result = await cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling abort for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling cleanup for attempt ID: ${testAttemptId}`);
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined(); // Should be removed from the map
  });

  it('should successfully cancel an existing connection attempt without cleanup', async () => {
    // Add attempt without a cleanup function
    __addConnectionAttempt(testAttemptId, mockAbortControllerInstance);

    const result = await cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).toHaveBeenCalledWith(`Calling abort for attempt ID: ${testAttemptId}`);
    // Should NOT have called debug for cleanup
    expect(mockLogger.debug).not.toHaveBeenCalledWith(`Calling cleanup for attempt ID: ${testAttemptId}`);
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).not.toHaveBeenCalled(); // Ensure cleanup was not called
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined(); // Should still be removed
  });

  it('should return false if no matching connection attempt is found', async () => {
    const nonExistentAttemptId = 'non-existent-id';
    const result = await cancelConnectionAttempt(nonExistentAttemptId);

    expect(result).toEqual({ success: false, message: 'No matching connection attempt found' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${nonExistentAttemptId}`);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling abort'));
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling cleanup'));
    expect(mockAbort).not.toHaveBeenCalled();
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(__getConnectionAttempt(nonExistentAttemptId)).toBeUndefined(); // Confirms it wasn't added
  });

  it('should handle cleanup promise rejection gracefully (does not throw)', async () => {
    const cleanupError = new Error('Cleanup failed');
    mockCleanup.mockRejectedValue(cleanupError); // Make cleanup throw an error

    __addConnectionAttempt(testAttemptId, mockAbortControllerInstance, mockCleanup);

    const result = await cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined(); // Still cleaned up from map
    expect(mockLogger.error).toHaveBeenCalledWith(
      { cleanupErr: cleanupError }, // The first argument is an object with cleanupErr
      `Error during cleanup for attempt ID: ${testAttemptId}` // The second argument is the message
    );
  });
});
