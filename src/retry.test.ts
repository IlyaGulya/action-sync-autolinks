import {afterEach, beforeEach, describe, expect, mock, test} from 'bun:test';
import {withRetry} from './retry';
import {mockInstantSetTimeout} from './test-support';

describe('withRetry', () => {
  let originalMathRandom: () => number;
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    originalMathRandom = Math.random;
    originalSetTimeout = globalThis.setTimeout;
  });

  afterEach(() => {
    Math.random = originalMathRandom;
    globalThis.setTimeout = originalSetTimeout;
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

  test('respects Retry-After header when present', async () => {
    const operation = mock()
      .mockRejectedValueOnce({
        response: {
          status: 429,
          headers: {'retry-after': '2'}
        }
      })
      .mockResolvedValueOnce('success');

    const setTimeoutMock = mockInstantSetTimeout();

    const result = await withRetry(operation, {baseDelay: 1000});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    // Should wait 2000ms (Retry-After value), not 1000ms (baseDelay)
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  test('falls back to exponential backoff when Retry-After is invalid', async () => {
    const operation = mock()
      .mockRejectedValueOnce({
        response: {
          status: 503,
          headers: {'retry-after': 'invalid'}
        }
      })
      .mockResolvedValueOnce('success');

    // Mock Math.random to make jitter predictable (0% jitter)
    Math.random = () => 0.5;

    const setTimeoutMock = mockInstantSetTimeout();

    const result = await withRetry(operation, {baseDelay: 100, maxDelay: 1000});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    // Should use baseDelay (100ms) with exponential backoff, not invalid retry-after
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 100);
  });

  test('caps Retry-After delay at maxDelay', async () => {
    const operation = mock()
      .mockRejectedValueOnce({
        response: {
          status: 429,
          headers: {'retry-after': '100'}
        }
      })
      .mockResolvedValueOnce('success');

    const setTimeoutMock = mockInstantSetTimeout();

    const result = await withRetry(operation, {baseDelay: 1000, maxDelay: 500});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    // Should cap at maxDelay (500ms), not use full retry-after (100s)
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  test('does not add jitter when using Retry-After', async () => {
    const operation = mock()
      .mockRejectedValueOnce({
        response: {
          status: 503,
          headers: {'retry-after': '1'}
        }
      })
      .mockResolvedValueOnce('success');

    // Mock Math.random to a value that would add significant jitter
    Math.random = () => 1.0; // Would add +25% jitter if used

    const setTimeoutMock = mockInstantSetTimeout();

    const result = await withRetry(operation, {baseDelay: 1000, maxDelay: 5000});

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
    // Should wait exactly 1000ms without jitter
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 1000);
  });
});
