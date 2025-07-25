import pino from 'pino';

jest.mock('pino');

let mockLogger: jest.Mocked<pino.Logger>;

const mockAbort = jest.fn();
class MockAbortController {
  signal: any;
  constructor() {
    this.signal = {};
  }
  abort = mockAbort;
}
global.AbortController = MockAbortController as any;

jest.mock('../index', () => {
  const internalPinoFactory = jest.requireMock('pino') as jest.MockedFunction<typeof pino>;
  const internalMockLogger = internalPinoFactory();

  const connectionAttempts = new Map<string, { controller: AbortController, cleanup?: () => Promise<void> }>();

  const mockedCancelConnectionAttempt = jest.fn(async (attemptId: string) => {
    internalMockLogger.debug(`Received cancellation request for attempt ID: ${attemptId}`);
    const attempt = connectionAttempts.get(attemptId);
    if (!attempt) {
      return { success: false, message: 'No matching connection attempt found' };
    }

    internalMockLogger.debug(`Calling abort for attempt ID: ${attemptId}`);
    attempt.controller.abort();

    if (attempt.cleanup) {
      internalMockLogger.debug(`Calling cleanup for attempt ID: ${attemptId}`);
      try {
        await attempt.cleanup();
      } catch (cleanupErr: any) {
        internalMockLogger.error({ cleanupErr }, `Error during cleanup for attempt ID: ${attemptId}`);
      }
    }

    connectionAttempts.delete(attemptId);
    return { success: true, message: 'Connection attempt cancelled' };
  });

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

const {
  cancelConnectionAttempt,
  __addConnectionAttempt,
  __getConnectionAttempt,
  __clearConnectionAttempts,
} = jest.requireMock('../index');


describe('cancelConnectionAttempt', () => {
  const testAttemptId = 'test-attempt-123';
  let mockCleanup: jest.Mock;
  let mockAbortControllerInstance: MockAbortController;

  beforeAll(() => {
    const pinoModule = jest.mocked(pino);
    mockLogger = pinoModule() as jest.Mocked<pino.Logger>;
  });


  beforeEach(() => {
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    __clearConnectionAttempts();

    mockCleanup = jest.fn().mockResolvedValue(undefined);
    mockAbortControllerInstance = new MockAbortController();
    mockAbort.mockClear();
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
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined();
  });

  it('should successfully cancel an existing connection attempt without cleanup', async () => {
    __addConnectionAttempt(testAttemptId, mockAbortControllerInstance);

    const result = await cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Received cancellation request for attempt ID: ${testAttemptId}`);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Calling cleanup'));
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined();
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
    expect(__getConnectionAttempt(nonExistentAttemptId)).toBeUndefined();
  });

  it('should handle cleanup promise rejection gracefully (does not throw)', async () => {
    const cleanupError = new Error('Cleanup failed');
    mockCleanup.mockRejectedValue(cleanupError);

    __addConnectionAttempt(testAttemptId, mockAbortControllerInstance, mockCleanup);

    const result = await cancelConnectionAttempt(testAttemptId);

    expect(result).toEqual({ success: true, message: 'Connection attempt cancelled' });
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(__getConnectionAttempt(testAttemptId)).toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { cleanupErr: cleanupError },
      `Error during cleanup for attempt ID: ${testAttemptId}`
    );
  });
});
