import { _clearArtistProfilePrefetchForTests, _getActivePrefetchedArtistKeysForTests,
  prefetchTrackArtistData } from '../artistProfilePrefetch';
import { resolveTrackArtist } from '../../search/artistIdentity';
import { getYouTubeMusicArtistProfile } from '../../../api/search/catalog';

jest.mock('../../search/artistIdentity', () => ({
  ...jest.requireActual('../../search/artistIdentity'), resolveTrackArtist: jest.fn(),
}));
jest.mock('../artistImageCache', () => ({ getCachedArtistImage: jest.fn().mockResolvedValue('') }));
jest.mock('../../images/imagePrefetch', () => ({ prefetchImage: jest.fn().mockResolvedValue(true) }));
jest.mock('../followedArtists', () => ({ isArtistFollowed: jest.fn().mockReturnValue(false) }));
jest.mock('../../../api/artists/artist', () => ({ getArtist: jest.fn(), discardPrefetchedArtistProfile: jest.fn() }));
jest.mock('../../../api/artists/artistDiscography', () => ({ getArtistDiscography: jest.fn() }));
jest.mock('../../../api/artists/artistTopTracks', () => ({ getArtistTopTracks: jest.fn(), discardPrefetchedArtistTopTracks: jest.fn() }));
jest.mock('../../../api/albums/youtubeMusicAlbum', () => ({ getYouTubeMusicAlbum: jest.fn() }));
jest.mock('../../../api/search/catalog', () => ({
  getYouTubeMusicArtistProfile: jest.fn().mockResolvedValue({ artist: { imageURL: '' } }),
  discardPrefetchedYouTubeMusicArtistProfile: jest.fn(), getArtistCatalogImage: jest.fn(),
}));
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('current track artist warmup', () => {
  beforeEach(() => { jest.clearAllMocks(); _clearArtistProfilePrefetchForTests(); });

  it('does not replace the current artists when an older recording lookup finishes later', async () => {
    let finishOld!: (value: { id: string; name: string }) => void;
    jest.mocked(resolveTrackArtist).mockImplementation((artist) => artist.name === 'Old'
      ? new Promise((resolve) => { finishOld = resolve; })
      : Promise.resolve({ id: 'ytartist_UCNew~New', name: 'New' }));
    prefetchTrackArtistData({ title: 'Old song', artistName: 'Old' });
    prefetchTrackArtistData({ title: 'New song', artistName: 'New' });
    await flush();
    expect(_getActivePrefetchedArtistKeysForTests()).toEqual(['youtube:UCNew']);
    finishOld({ id: 'ytartist_UCOld~Old', name: 'Old' });
    await flush();
    expect(_getActivePrefetchedArtistKeysForTests()).toEqual(['youtube:UCNew']);
    expect(getYouTubeMusicArtistProfile).not.toHaveBeenCalledWith('ytartist_UCOld~Old');
  });

  it('coalesces aliases before requesting the same artist catalog twice', async () => {
    jest.mocked(resolveTrackArtist).mockImplementation(async (artist) => ({ id: artist.id!, name: artist.name }));
    prefetchTrackArtistData({ title: 'Same artist song', artistName: 'Sotam, RND', artists: [
      { id: 'ytartist_UCSame~Sotam', name: 'Sotam' }, { id: 'ytartist_UCSame~RND', name: 'RND' },
    ] });
    await flush();
    expect(_getActivePrefetchedArtistKeysForTests()).toEqual(['youtube:UCSame']);
    expect(resolveTrackArtist).toHaveBeenCalledTimes(1);
  });
});
