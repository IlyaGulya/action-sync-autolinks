export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on final attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      // Check if error is retryable
      const isRetryable =
        (error.status && config.retryableStatusCodes.includes(error.status)) ||
        (error.response?.status && config.retryableStatusCodes.includes(error.response.status)) ||
        (typeof error.code === 'string' && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'));

      if (!isRetryable) {
        break;
      }

      // Check for Retry-After header
      const retryAfter = error.response?.headers?.['retry-after'];
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;

      let delay: number;
      if (Number.isFinite(retryAfterSeconds)) {
        // Use Retry-After value (in seconds)
        delay = Math.min(retryAfterSeconds * 1000, config.maxDelay);
      } else {
        // Calculate delay with exponential backoff
        delay = Math.min(
          config.baseDelay * Math.pow(2, attempt - 1),
          config.maxDelay
        );
      }

      // Add jitter (±25%) only for exponential backoff
      const jitter = Number.isFinite(retryAfterSeconds) ? 0 : delay * 0.25 * (Math.random() * 2 - 1);
      const finalDelay = Math.max(0, delay + jitter);

      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }

  throw lastError || new Error('Operation failed after retries');
}