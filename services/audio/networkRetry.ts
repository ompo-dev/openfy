/** Connection failures say nothing about whether a particular song is playable. */
export const isTransientNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|cancel/i.test(message)) return false;
  return /network|connection.*(?:lost|closed|reset)|fetch failed|failed to fetch|timed?\s*out|timeout|ECONNRESET|ENETUNREACH|EAI_AGAIN/i.test(message);
};

/** Only for read-only requests; authorization and content errors are not retried. */
export const retryNetworkOperation = async <T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, error: unknown) => void,
  deadline = Infinity
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = 300 * 2 ** attempt;
      if (attempt >= 2 || !isTransientNetworkError(error) || Date.now() + delayMs >= deadline) throw error;
      onRetry?.(attempt + 2, error);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
};
