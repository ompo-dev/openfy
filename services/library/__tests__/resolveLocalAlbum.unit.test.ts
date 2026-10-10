import { resolveLocalAlbum } from '../resolveLocalAlbum';
import { getLibraryTracks } from '../catalogLibrary';
import { getRememberedAlbum, withLibraryAlbumTracks } from '../albumMetadata';
import { getYouTubeMusicAlbum } from '../../../api/albums/youtubeMusicAlbum';
import { getYouTubeMusicArtistProfile } from '../../../api/search/catalog';

jest.mock('../catalogLibrary', () => ({ getLibraryTracks: jest.fn() }));
jest.mock('../albumMetadata', () => ({ getRememberedAlbum: jest.fn(), withLibraryAlbumTracks: jest.fn(async (album) => album) }));
jest.mock('../../../api/albums/youtubeMusicAlbum', () => ({ getYouTubeMusicAlbum: jest.fn() }));
jest.mock('../../../api/search/catalog', () => ({ getYouTubeMusicArtistProfile: jest.fn() }));

const complete = { id: 'ytalbum_MPREkm2', name: 'KM2', tracks: Array.from({ length: 11 }, (_, index) => ({ id: `yt_${index}` })) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getRememberedAlbum).mockResolvedValue(null);
  jest.mocked(getLibraryTracks).mockResolvedValue([0, 1].map((index) => ({
    spotifyId: `saved-${index}`, title: `Track ${index}`, artistName: 'Ebony',
    albumName: 'KM2', albumId: 'spotify-km2', imageURL: '', localImagePath: 'file:///km2.jpg', duration_ms: 120000,
    artists: [{ id: 'spotify-artist', name: 'Ebony' }],
  })) as never);
  jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({ albums: [{ id: complete.id, title: 'KM2' }], singlesAndEps: [] } as never);
  jest.mocked(getYouTubeMusicAlbum).mockResolvedValue(complete as never);
});

it('resolves a two-track local album to the complete public album', async () => {
  const result = await resolveLocalAlbum('spotify:spotify-km2');
  expect(result.tracks).toHaveLength(11);
  expect(getYouTubeMusicAlbum).toHaveBeenCalledWith(complete.id);
  expect(withLibraryAlbumTracks).toHaveBeenCalledWith(complete);
});

it('publishes saved songs before a slow public lookup finishes', async () => {
  let finish!: (value: unknown) => void;
  jest.mocked(getYouTubeMusicArtistProfile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as never; }));
  const preview = jest.fn();
  const request = resolveLocalAlbum('spotify:spotify-km2', preview);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ partial: true, tracks: expect.any(Array) }));
  expect(preview.mock.calls[0][0].tracks).toHaveLength(2);
  finish({ albums: [{ id: complete.id, title: 'KM2' }], singlesAndEps: [] });
  expect((await request).tracks).toHaveLength(11);
});

it('opens remembered membership instantly even after the old local album id has changed', async () => {
  jest.mocked(getLibraryTracks).mockResolvedValue([]);
  jest.mocked(getRememberedAlbum).mockResolvedValue(complete as never);
  expect((await resolveLocalAlbum('spotify:old-id')).tracks).toHaveLength(11);
  expect(getYouTubeMusicArtistProfile).not.toHaveBeenCalled();
});

it('resolves singles and EPs from their own shelf as well', async () => {
  jest.mocked(getYouTubeMusicArtistProfile).mockResolvedValue({ albums: [], singlesAndEps: [{ id: complete.id, title: 'KM2' }] } as never);
  expect((await resolveLocalAlbum('spotify:spotify-km2')).tracks).toHaveLength(11);
});

it('retains a playable, explicitly partial library subset offline', async () => {
  jest.mocked(getYouTubeMusicArtistProfile).mockRejectedValue(new Error('Offline'));
  expect(await resolveLocalAlbum('spotify:spotify-km2')).toMatchObject({
    name: 'KM2', partial: true, artists: [{ id: 'spotify-artist', name: 'Ebony' }],
    tracks: [{ id: 'saved-0', imageURL: 'file:///km2.jpg' }, { id: 'saved-1', imageURL: 'file:///km2.jpg' }],
  });
});
