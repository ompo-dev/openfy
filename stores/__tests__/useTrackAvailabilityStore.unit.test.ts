import { useTrackAvailabilityStore, markTrackUnavailable, isTrackUnavailable,
  clearTrackUnavailableMany } from '../useTrackAvailabilityStore';
import { hasConfirmedCatalogMapping } from '../../services/audio/catalogMappingCache';

jest.mock('../../services/audio/catalogMappingCache', () => ({
  hasConfirmedCatalogMapping: jest.fn().mockReturnValue(false),
  hydrateCatalogMappings: jest.fn().mockResolvedValue(undefined),
}));

const track = { spotifyId: 'spotify_123', title: 'Música corrigida', youtubeVideoId: 'abcdefghijk' };

describe('availability with explicit audio links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(hasConfirmedCatalogMapping).mockReturnValue(false);
    useTrackAvailabilityStore.setState({ failures: {} });
  });

  it('does not hide a user-mapped audio link because of a previous canonical failure', () => {
    markTrackUnavailable(track, 'no-canonical-match');
    expect(isTrackUnavailable(track)).toBe(true);
    jest.mocked(hasConfirmedCatalogMapping).mockReturnValue(true);
    expect(isTrackUnavailable(track)).toBe(false);
  });

  it('does not mark an existing YouTube URL unavailable when it is already linked', () => {
    const linked = { ...track, youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' };
    markTrackUnavailable(linked, 'no-canonical-match');
    expect(isTrackUnavailable(linked)).toBe(false);
  });

  it('accepts a direct stored audio URL even when an old failure flag remains', () => {
    markTrackUnavailable(track, 'no-canonical-match');
    expect(isTrackUnavailable({ ...track, audioUrl: 'https://media.example/song.mp3' })).toBe(false);
  });

  it('clears imported recording error badges in a single store update', () => {
    markTrackUnavailable(track, 'no-canonical-match');
    clearTrackUnavailableMany([track]);
    expect(isTrackUnavailable(track)).toBe(false);
    expect(Object.values(useTrackAvailabilityStore.getState().failures)).toHaveLength(0);
  });
});
