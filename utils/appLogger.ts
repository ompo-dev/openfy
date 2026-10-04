export type LogCategory =
  | 'nav'
  | 'search'
  | 'artist'
  | 'playlist'
  | 'player'
  | 'download'
  | 'home'
  | 'updates'
  | 'network'
  | 'ui'
  | 'input'
  | 'scroll'
  | 'error';

export type LogEntry = {
  ts: string;
  category: LogCategory;
  event: string;
  meta?: string;
};

const LOG_CAPACITY = 500;
const META_LIMIT = 1_000;
const isDevelopment =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test');

let consoleEnabled = isDevelopment;
export const logConfig = { verbose: false, capture: true };
const ring: LogEntry[] = [];
const CATEGORY_LABEL: Record<LogCategory, string> = {
  nav: 'NAV',
  search: 'SEARCH',
  artist: 'ARTIST',
  playlist: 'PLAYLIST',
  player: 'PLAYER',
  download: 'DOWNLOAD',
  home: 'HOME',
  updates: 'UPDATES',
  network: 'NETWORK',
  ui: 'UI',
  input: 'INPUT',
  scroll: 'SCROLL',
  error: 'ERROR',
};

const stamp = () => new Date().toISOString();

const redactUrl = (value: string) =>
  value.replace(/https?:\/\/[^\s'"<>]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '[url]';
    }
  });

const clip = (value: string) => {
  const redacted = redactUrl(value);
  return redacted.length > META_LIMIT
    ? `${redacted.slice(0, META_LIMIT - 3)}...`
    : redacted;
};

const normalizeValue = (
  key: string,
  value: unknown,
  depth = 0
): unknown => {
  if (/(authorization|access.?token|refresh.?token|client.?secret|password)/i.test(key)) {
    return '[redacted]';
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: clip(value.message),
      ...(value.stack ? { stack: clip(value.stack) } : {}),
    };
  }
  if (typeof value === 'string') return clip(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }
  if (depth >= 4) return '[nested]';
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => normalizeValue(key, item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          normalizeValue(nestedKey, nestedValue, depth + 1),
        ])
    );
  }
  return String(value);
};

const serializeMeta = (meta: unknown) => {
  try {
    const serialized = JSON.stringify(normalizeValue('meta', meta));
    return serialized ? clip(serialized) : undefined;
  } catch {
    return clip(String(meta));
  }
};

const emit = (category: LogCategory, event: string, meta?: unknown) => {
  if (!consoleEnabled && !logConfig.capture) return;
  const normalizedMeta = meta === undefined ? undefined : normalizeValue('meta', meta);
  const text = meta === undefined ? undefined : serializeMeta(meta);
  if (consoleEnabled) {
    const label = `${stamp()} [${CATEGORY_LABEL[category]}] ${event}`;
    if (category === 'error') {
      if (normalizedMeta === undefined) console.error(label);
      else console.error(label, normalizedMeta);
    } else if (normalizedMeta === undefined) {
      console.log(label);
    } else {
      console.log(label, normalizedMeta);
    }
  }
  if (!logConfig.capture) return;
  if (ring.length >= LOG_CAPACITY) ring.shift();
  ring.push({ ts: stamp(), category, event, ...(text ? { meta: text } : {}) });
};

const make = (category: LogCategory) => (event: string, meta?: unknown) =>
  emit(category, event, meta);

const time = (category: LogCategory, event: string, meta?: unknown) => {
  emit(category, `${event} started`, meta);
  const startedAt = Date.now();
  let ended = false;
  return (result?: unknown) => {
    if (ended) return;
    ended = true;
    emit(category, `${event} finished`, {
      durationMs: Date.now() - startedAt,
      ...(result === undefined ? {} : { result }),
    });
  };
};

export const log = {
  nav: make('nav'),
  search: make('search'),
  artist: make('artist'),
  playlist: make('playlist'),
  player: make('player'),
  download: make('download'),
  home: make('home'),
  updates: make('updates'),
  network: make('network'),
  ui: make('ui'),
  error: make('error'),
  input: (event: string, meta?: unknown) => {
    if (logConfig.verbose) emit('input', event, meta);
  },
  scroll: (event: string, meta?: unknown) => {
    if (logConfig.verbose) emit('scroll', event, meta);
  },
  time,
};

export const getLogBuffer = (): ReadonlyArray<LogEntry> => [...ring].reverse();

export type PerformanceMetricSummary = {
  category: LogCategory;
  action: string;
  count: number;
  failures: number;
  averageMs: number;
  p50Ms: number;
  maxMs: number;
};

export const getPerformanceMetricSummary = (): PerformanceMetricSummary[] => {
  const groups = new Map<string, {
    category: LogCategory;
    action: string;
    durations: number[];
    failures: number;
  }>();
  ring.forEach((entry) => {
    if (!entry.event.endsWith(' finished') || !entry.meta) return;
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(entry.meta) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof meta.durationMs !== 'number' || !Number.isFinite(meta.durationMs)) return;
    const action = entry.event.slice(0, -' finished'.length);
    const key = `${entry.category}:${action}`;
    const group = groups.get(key) || {
      category: entry.category,
      action,
      durations: [],
      failures: 0,
    };
    group.durations.push(meta.durationMs);
    const result = meta.result;
    if (meta.ok === false || (result && typeof result === 'object' &&
        (result as Record<string, unknown>).ok === false)) group.failures += 1;
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => {
    const sorted = [...group.durations].sort((a, b) => a - b);
    return {
      category: group.category,
      action: group.action,
      count: sorted.length,
      failures: group.failures,
      averageMs: Math.round(sorted.reduce((total, duration) => total + duration, 0) / sorted.length),
      p50Ms: sorted[Math.floor((sorted.length - 1) / 2)],
      maxMs: sorted[sorted.length - 1],
    };
  }).sort((a, b) => b.count - a.count || b.maxMs - a.maxMs);
};

export const formatPerformanceMetricSummary = (
  metrics = getPerformanceMetricSummary()
) => metrics.length
  ? metrics.map((metric) =>
      `[${metric.category}] ${metric.action}: n=${metric.count}, média=${metric.averageMs}ms, p50=${metric.p50Ms}ms, max=${metric.maxMs}ms, falhas=${metric.failures}`
    ).join('\n')
  : 'Ainda não há métricas de tempo nesta sessão.';

export const clearLogBuffer = () => {
  ring.length = 0;
};

export const formatLogBuffer = (entries = getLogBuffer()) =>
  entries
    .map((entry) =>
      `${entry.ts} [${entry.category}] ${entry.event}${entry.meta ? ` ${entry.meta}` : ''}`
    )
    .join('\n');

export const _setLoggerForTests = (options: {
  capture?: boolean;
  console?: boolean;
}) => {
  if (options.capture !== undefined) logConfig.capture = options.capture;
  if (options.console !== undefined) consoleEnabled = options.console;
};

let installed = false;

export const installErrorLogging = () => {
  if (installed) return;
  installed = true;

  const globalWithError = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (
        handler: (error: unknown, isFatal?: boolean) => void
      ) => void;
    };
    onunhandledrejection?: ((event: { reason?: unknown }) => void) | null;
  };
  const errorUtils = globalWithError.ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    log.error(isFatal ? 'uncaught fatal exception' : 'uncaught exception', error);
    previousHandler?.(error, isFatal);
  });

  const previousRejectionHandler = globalWithError.onunhandledrejection;
  globalWithError.onunhandledrejection = (event) => {
    log.error('unhandled promise rejection', event.reason);
    previousRejectionHandler?.(event);
  };
};
