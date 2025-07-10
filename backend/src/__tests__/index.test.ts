import { generateAIQuery } from '../index';
import type { Document, SchemaMap } from '../types';

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

// Mock global fetch
const mockFetch = jest.spyOn(global, 'fetch').mockName('fetch');

describe('generateAIQuery', () => {
  const userPrompt = 'find users older than 30, sorted by name';
  const collectionName = 'users';
  const schemaMap: SchemaMap = { _id: ['ObjectId'], name: ['string'], age: ['number'] };
  const sampleDocuments: Document[] = [{ _id: '1', name: 'Alice', age: 25 }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  afterAll(() => {
    mockFetch.mockRestore();
  });

  it('returns valid JSON from AI response', async () => {
    const queryObject = { query: { age: { $gt: 30 } }, sort: { name: 1 } };
    const aiResponse = {
      choices: [{ message: { content: JSON.stringify(queryObject, null, 2) } }],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(aiResponse),
    } as any);

    const result = await generateAIQuery(userPrompt, collectionName, schemaMap, sampleDocuments);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        }),
      })
    );
    expect(result).toEqual({
      generatedQuery: JSON.stringify(queryObject, null, 2),
    });
    const mockLogger = require('pino')();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName, userPromptLength: userPrompt.length, sampleDocCount: 1, model: 'grok-3-mini' }),
      'Sending request to Query Helper (grok-3-mini)...'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ generatedTextLength: expect.any(Number) }),
      'Query Helper (grok-3-mini) returned a response.'
    );
  });

  it('handles invalid JSON from AI', async () => {
    const aiResponse = { choices: [{ message: { content: '{"query": {"age": "invalid"' } }] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(aiResponse),
    } as any);

    const result = await generateAIQuery(userPrompt, collectionName, schemaMap, sampleDocuments);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        }),
      })
    );
    expect(result).toEqual({
      error: 'Query Helper generated invalid JSON. Please try again with a clearer prompt.',
    });
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ parseError: expect.any(String), generatedText: '{"query": {"age": "invalid"' }),
      'Failed to parse Query Helper generated JSON'
    );
  });

  it('handles non-ok API response', async () => {
    const aiResponse = { error: { message: 'Server error' } };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValueOnce(aiResponse),
    } as any);

    const result = await generateAIQuery(userPrompt, collectionName, schemaMap, sampleDocuments);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        }),
      })
    );
    expect(result).toEqual({
      error: 'Query Helper API error: 500 - Server error',
    });
    const mockLogger = require('pino')();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, errorData: aiResponse }),
      'Query Helper API Error Response'
    );
  });

  it('handles empty AI response', async () => {
    const aiResponse = { choices: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(aiResponse),
    } as any);

    const result = await generateAIQuery(userPrompt, collectionName, schemaMap, sampleDocuments);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://5rzrdmbmtr2n5eobrxe5wr7rvm0yecco.lambda-url.us-west-2.on.aws/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
        }),
      })
    );
    expect(result).toEqual({
      error: 'Query Helper did not return a valid response structure.',
    });
    const mockLogger = require('pino')();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ result: aiResponse }),
      'Query Helper (grok-3-mini) did not return a valid response structure.'
    );
  });
});
