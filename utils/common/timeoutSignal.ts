export const createTimeoutSignal = (timeoutMs: number) => {
  if (typeof AbortController === 'undefined') {
    return { signal: undefined, clear: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number
) => {
  const timeout = createTimeoutSignal(timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? timeout.signal });
  } finally {
    timeout.clear();
  }
};
