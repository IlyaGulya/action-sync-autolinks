import {afterEach, beforeEach, describe, expect, mock, test} from 'bun:test';
import {withRetry} from './retry';

describe('withRetry', () => {
  let originalMathRandom: () => number;

  beforeEach(() => {
    originalMathRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalMathRandom;
  });

  test('succeeds on first attempt', async () => {
    const operation = mock().mockResolvedValue('success');

    const result = await withRetry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('retries on retryable HTTP status codes', async () => {
    const operation = mock();
    operation
      .mockImplementationOnce(() => Promise.reject({response: {status: 503}}))
      .mockImplementationOnce(() => Promise.reject({response: {status: 502}}))
      .mockImplementationOnce(() => Promise.resolve('success'));

    const result = await withRetry(operation, {baseDelay: 0, maxDelay: 0});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('retries on direct status property', async () => {
    const operation = mock()
      .mockRejectedValueOnce({status: 429})
      .mockResolvedValueOnce('success');

    const result = await withRetry(operation, {baseDelay: 0});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('retries on network error codes', async () => {
    const operation = mock();
    operation
      .mockImplementationOnce(() => Promise.reject({code: 'ECONNRESET'}))
      .mockImplementationOnce(() => Promise.reject({code: 'ETIMEDOUT'}))
      .mockImplementationOnce(() => Promise.resolve('success'));

    const result = await withRetry(operation, {baseDelay: 0});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('stops retrying on non-retryable status codes', async () => {
    const operation = mock().mockRejectedValue({response: {status: 400}});

    expect(withRetry(operation, {baseDelay: 0})).rejects.toEqual({response: {status: 400}});
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('stops retrying on non-retryable errors', async () => {
    const operation = mock().mockRejectedValue(new Error('Not retryable'));

    expect(withRetry(operation, {baseDelay: 0})).rejects.toThrow('Not retryable');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('respects maxAttempts limit', async () => {
    const operation = mock().mockRejectedValue({response: {status: 503}});

    expect(withRetry(operation, {maxAttempts: 2, baseDelay: 0})).rejects.toEqual({response: {status: 503}});
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('exponential backoff with short delays', async () => {
    const operation = mock();
    operation
      .mockImplementationOnce(() => Promise.reject({response: {status: 503}}))
      .mockImplementationOnce(() => Promise.reject({response: {status: 503}}))
      .mockImplementationOnce(() => Promise.resolve('success'));

    const result = await withRetry(operation, {baseDelay: 0, maxDelay: 0});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('uses default options when not specified', async () => {
    const operation = mock()
      .mockRejectedValueOnce({response: {status: 503}})
      .mockResolvedValueOnce('success');

    const result = await withRetry(operation, {baseDelay: 0});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('throws error when all retries exhausted', async () => {
    const operation = mock().mockRejectedValue({response: {status: 503}});

    expect(withRetry(operation, {maxAttempts: 1, baseDelay: 0}))
      .rejects.toEqual({response: {status: 503}});
  });

  test('handles undefined lastError edge case', async () => {
    // This shouldn't happen in practice, but test the fallback
    const operation = mock(() => {
      throw undefined;
    });

    expect(withRetry(operation, {maxAttempts: 1, baseDelay: 0}))
      .rejects.toThrow('Operation failed after retries');
  });
});
