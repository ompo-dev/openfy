import {
  _setLoggerForTests,
  clearLogBuffer,
  formatLogBuffer,
  formatPerformanceMetricSummary,
  getLogBuffer,
  getPerformanceMetricSummary,
  log,
  logConfig,
} from '../appLogger';

describe('app logger', () => {
  beforeEach(() => {
    clearLogBuffer();
    _setLoggerForTests({ capture: true, console: false });
    logConfig.verbose = false;
  });

  afterEach(() => {
    _setLoggerForTests({ capture: false, console: false });
    logConfig.verbose = false;
    clearLogBuffer();
  });

  it('keeps the newest entries first and bounds the in-memory buffer', () => {
    for (let index = 0; index < 505; index += 1) {
      log.player(`event-${index}`);
    }

    const entries = getLogBuffer();
    expect(entries).toHaveLength(500);
    expect(entries[0].event).toBe('event-504');
    expect(entries[499].event).toBe('event-5');
  });

  it('redacts secrets and URL query values before storing details', () => {
    log.error('request failed', {
      authorization: 'Bearer private-token',
      url: 'https://media.example/audio?sig=private-signature',
    });

    const output = formatLogBuffer();
    expect(output).toContain('[redacted]');
    expect(output).toContain('https://media.example/audio');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('private-signature');
  });

  it('captures input events only in verbose mode', () => {
    log.input('search changed', { length: 3 });
    expect(getLogBuffer()).toHaveLength(0);

    logConfig.verbose = true;
    log.input('search changed', { length: 3 });
    expect(getLogBuffer()).toHaveLength(1);
  });

  it('can stop capture independently from console output', () => {
    logConfig.capture = false;
    log.nav('route changed');
    expect(getLogBuffer()).toHaveLength(0);
  });

  it('summarizes timed operations for settings and copied diagnostics', () => {
    const finish = log.time('search', 'catalog query');
    finish({ ok: true });
    const metrics = getPerformanceMetricSummary();

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      category: 'search',
      action: 'catalog query',
      count: 1,
      failures: 0,
    });
    expect(formatPerformanceMetricSummary(metrics)).toContain('catalog query');
  });
});
