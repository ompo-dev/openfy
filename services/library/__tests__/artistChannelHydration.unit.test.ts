import { hydrateLibraryArtistChannels } from '../artistChannelHydration';
import { getCatalogTracks, upsertCatalogTracks, type LibraryTrack } from '../catalogLibrary';
import { getDownloadedTrack } from '../../download/downloadManager';
import { getArtistRecordingVideoId } from '../../search/artistIdentity';
import { resolveTrackCredits } from '../../search/trackCredits';
import { useLibraryStore } from '../../../stores/useLibraryStore';

jest.mock('../catalogLibrary', () => ({ getCatalogTracks: jest.fn(), upsertCatalogTracks: jest.fn() }));
jest.mock('../../download/downloadManager', () => ({ getDownloadedTrack: jest.fn() }));
jest.mock('../../search/artistIdentity', () => ({
  ...jest.requireActual('../../search/artistIdentity'),
  getArtistRecordingVideoId: jest.fn(), resolveTrackArtists: jest.fn(),
}));
jest.mock('../../search/trackCredits', () => ({ ARTIST_CREDITS_VERSION: 2, resolveTrackCredits: jest.fn() }));
jest.mock('../../../stores/useLibraryStore', () => {
  const state = { refreshLibrary: jest.fn() };
  return { useLibraryStore: { getState: () => state } };
});

const videoId = 'abcdefghijk';
const artists = [{ id: `ytartist_UC${'a'.repeat(22)}~Channel`, name: 'Channel' }];
const track = (id: string): LibraryTrack => ({
  spotifyId: id, title: 'Recording', artistName: 'Imported credit',
  artists: [{ id: '1234567890123456789012', name: 'Imported credit' }],
  albumName: 'Release', imageURL: 'cover.jpg', youtubeVideoId: videoId,
  duration_ms: 180_000, isDownloaded: false,
} as LibraryTrack);
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

describe('saved recording channel migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getArtistRecordingVideoId).mockImplementation(async (item) => item.youtubeVideoId || '');
    jest.mocked(resolveTrackCredits).mockResolvedValue({ artists, artistCreditsVersion: 2 });
    jest.mocked(getDownloadedTrack).mockResolvedValue(null);
    jest.mocked(upsertCatalogTracks).mockResolvedValue([]);
  });

  it('returns immediately and persists the exact recording credits in the background', async () => {
    const saved = track('hydrate-background');
    jest.mocked(getCatalogTracks).mockResolvedValue([saved]);
    expect(hydrateLibraryArtistChannels([saved])).toBeUndefined();
    expect(upsertCatalogTracks).not.toHaveBeenCalled();
    await flush();
    expect(resolveTrackCredits).toHaveBeenCalledWith(saved);
    expect(upsertCatalogTracks).toHaveBeenCalledWith([{ ...saved, artists, artistName: 'Channel', artistCreditsVersion: 2 }]);
    expect(useLibraryStore.getState().refreshLibrary).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a removed recording', async () => {
    jest.mocked(getCatalogTracks).mockResolvedValue([]);
    hydrateLibraryArtistChannels([track('hydrate-removed')]);
    await flush();
    expect(upsertCatalogTracks).not.toHaveBeenCalled();
  });

  it('does not overwrite metadata when the linked video changed during loading', async () => {
    const saved = track('hydrate-edited');
    jest.mocked(getCatalogTracks).mockResolvedValue([{ ...saved, youtubeVideoId: 'lmnopqrstuv' }]);
    hydrateLibraryArtistChannels([saved]);
    await flush();
    expect(upsertCatalogTracks).not.toHaveBeenCalled();
  });

  it('retains unrelated edits made while the channel was loading', async () => {
    const saved = track('hydrate-concurrent-edit');
    jest.mocked(getCatalogTracks).mockResolvedValue([{ ...saved, title: 'Edited title' }]);
    hydrateLibraryArtistChannels([saved]);
    await flush();
    expect(upsertCatalogTracks).toHaveBeenCalledWith([expect.objectContaining({ title: 'Edited title', artists })]);
  });

  it('does not retry an unavailable video on every library refresh', async () => {
    jest.mocked(resolveTrackCredits).mockResolvedValue({ artists: [] });
    const saved = track('hydrate-unavailable');
    hydrateLibraryArtistChannels([saved]);
    await flush();
    hydrateLibraryArtistChannels([saved]);
    await flush();
    expect(resolveTrackCredits).toHaveBeenCalledTimes(1);
  });

  it('does not refetch verified complete credits on every refresh', async () => {
    hydrateLibraryArtistChannels([{ ...track('hydrate-native'), artists, artistCreditsVersion: 2 }]);
    await flush();
    expect(resolveTrackCredits).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().refreshLibrary).not.toHaveBeenCalled();
  });

  it('repairs previously truncated credits even if every saved participant has a native id', async () => {
    const saved = { ...track('hydrate-truncated'), artists };
    jest.mocked(getCatalogTracks).mockResolvedValue([saved]);
    hydrateLibraryArtistChannels([saved]);
    await flush();
    expect(resolveTrackCredits).toHaveBeenCalledWith(saved);
  });

  it('does not overwrite new credit edits made during recovery', async () => {
    const saved = track('hydrate-credit-edited');
    jest.mocked(getCatalogTracks).mockResolvedValue([{ ...saved, artists: [{ id: 'edited', name: 'Edited' }] }]);
    hydrateLibraryArtistChannels([saved]);
    await flush();
    expect(upsertCatalogTracks).not.toHaveBeenCalled();
  });
});
