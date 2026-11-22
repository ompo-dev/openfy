import { useTrackAvailabilityStore, markTrackUnavailable, isTrackUnavailable,
  clearTrackUnavailableMany } from '../useTrackAvailabilityStore';
import { hasUserDirectCatalogMapping } from '../../services/audio/catalogMappingCache';

jest.mock('../../services/audio/catalogMappingCache', () => ({
  hasUserDirectCatalogMapping: jest.fn().mockReturnValue(false),
  hydrateCatalogMappings: jest.fn().mockResolvedValue(undefined),
}));

const track = { spotifyId: 'spotify_123', title: 'Música corrigida', youtubeVideoId: 'abcdefghijk' };

describe('availability with explicit audio links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(hasUserDirectCatalogMapping).mockReturnValue(false);
    useTrackAvailabilityStore.setState({ failures: {} });
  });

  it('does not hide a user-mapped audio link because of a previous canonical failure', () => {
    markTrackUnavailable(track, 'no-canonical-match');
    expect(isTrackUnavailable(track)).toBe(true);
    jest.mocked(hasUserDirectCatalogMapping).mockReturnValue(true);
    expect(isTrackUnavailable(track)).toBe(false);
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
