import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearTrackUnavailable, hydrateTrackAvailability, isTrackUnavailable,
  markTrackUnavailable, useTrackAvailabilityStore } from '../useTrackAvailabilityStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined),
}));
const track = { spotifyId: 'song', title: 'Music' };

describe('track availability', () => {
  beforeEach(() => { useTrackAvailabilityStore.setState({ failures: {} }); jest.clearAllMocks(); });
  afterEach(() => jest.restoreAllMocks());

  it('hydrates only valid persisted failures', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify({
      '["song","music"]': { reason: 'no-canonical-match', at: 1 }, invalid: null,
    }));
    await hydrateTrackAvailability();
    expect(isTrackUnavailable(track)).toBe(true);
    expect(useTrackAvailabilityStore.getState().failures.invalid).toBeUndefined();
  });

  it('preserves unavailable metadata but makes a corrected link and downloaded audio playable', () => {
    markTrackUnavailable(track, 'no-canonical-match');
    expect(isTrackUnavailable(track)).toBe(true);
    expect(isTrackUnavailable({ ...track, youtubeVideoId: 'aaaaaaaaaaa' })).toBe(false);
    expect(isTrackUnavailable({ ...track, localAudioPath: 'file:///music.m4a' })).toBe(false);
    clearTrackUnavailable(track);
    expect(isTrackUnavailable(track)).toBe(false);
  });

  it('allows retrying transient network failures instead of permanently hiding a track', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    markTrackUnavailable(track, 'source-unavailable');
    expect(isTrackUnavailable(track)).toBe(true);
    clock.mockReturnValue(1000 + 5 * 60_000);
    expect(isTrackUnavailable(track)).toBe(false);
  });
});
