import {
  _resetPlaybackPriorityForTests, playbackStartupPending, reservePlaybackStartup,
  yieldToPlaybackStartup,
} from '../audioPriority';

describe('playback startup priority', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(1_000); _resetPlaybackPriorityForTests(); });
  afterEach(() => { _resetPlaybackPriorityForTests(); jest.useRealTimers(); });

  it('defers background work only for the bounded startup window', async () => {
    reservePlaybackStartup(4_000);
    expect(playbackStartupPending()).toBe(true);
    let done = false;
    const work = yieldToPlaybackStartup().then(() => { done = true; });
    await jest.advanceTimersByTimeAsync(3_999);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await work;
    expect(playbackStartupPending()).toBe(false);
    expect(done).toBe(true);
  });

  it('caps background delay even if several startup requests extend the deadline', async () => {
    reservePlaybackStartup(20_000);
    const work = yieldToPlaybackStartup(1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(work).resolves.toBeUndefined();
    expect(playbackStartupPending()).toBe(true);
  });
});
