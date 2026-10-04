import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadedTracks } from '../../download/downloadManager';
import { getLibraryTracks, upsertCatalogTracks } from '../catalogLibrary';
import { getRememberedAlbum, rememberAlbumMetadata, withLibraryAlbumTracks } from '../albumMetadata';
import type { YouTubeMusicAlbum } from '../../../api/albums/youtubeMusicAlbum';

jest.mock('../../download/downloadManager', () => ({ getDownloadedTracks: jest.fn().mockResolvedValue([]) }));

const album: YouTubeMusicAlbum = {
  id: 'ytalbum_MPREkm2', name: 'KM2', imageURL: 'https://images.test/km2.jpg', releaseDate: '2025', releaseType: 'album',
  artists: [{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }],
  tracks: Array.from({ length: 11 }, (_, index) => ({
    id: `yt_${index}`, title: `Track ${index}`, subtitle: 'Ebony', albumId: 'MPREkm2', albumName: 'KM2',
    artists: [{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }],
    albumArtists: [{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }],
    trackNumber: index + 1, imageURL: 'https://images.test/km2.jpg', durationMs: 120000,
  })),
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(getDownloadedTracks).mockResolvedValue([]);
});

it('remembers all members and aliases while enriching only the two tracks already saved', async () => {
  await upsertCatalogTracks(album.tracks.slice(0, 2).map((track) => ({
    spotifyId: `spotify-${track.id}`, title: track.title, artistName: 'Ebony',
    albumName: 'KM2', albumId: 'old-spotify-album', imageURL: 'old-artwork', duration_ms: 120000,
  })));
  await rememberAlbumMetadata(album);
  const library = await getLibraryTracks();
  expect(library).toHaveLength(2);
  library.forEach((track) => expect(track).toMatchObject({ albumId: 'MPREkm2', imageURL: album.imageURL, trackNumber: expect.any(Number) }));
  expect(await getRememberedAlbum('spotify:old-spotify-album')).toEqual(album);
  const complete = await withLibraryAlbumTracks(album);
  expect(complete.tracks).toHaveLength(11);
  expect(complete.tracks[0].id).toBe('spotify-yt_0');
  expect(complete.tracks[2].id).toBe('yt_2');
  await rememberAlbumMetadata(album);
  expect((await getRememberedAlbum('spotify:old-spotify-album'))?.tracks).toHaveLength(11);
});

it('preserves an existing offline file and does not join a different artist with the same title', async () => {
  jest.mocked(getDownloadedTracks).mockResolvedValue([{
    spotifyId: 'saved-track', title: 'Track 0', artistName: 'Ebony', albumName: 'KM2', albumId: 'old-id',
    imageURL: '', duration_ms: 120000, localAudioPath: 'file:///track.m4a', localImagePath: 'file:///km2.jpg',
  }, {
    spotifyId: 'unrelated', title: 'Track 1', artistName: 'Someone else', albumName: 'KM2', duration_ms: 120000, imageURL: '',
  }] as never);
  await rememberAlbumMetadata(album);
  const complete = await withLibraryAlbumTracks(album);
  expect(complete.tracks[0]).toMatchObject({ id: 'saved-track', localAudioPath: 'file:///track.m4a', imageURL: 'file:///km2.jpg', isDownloaded: true });
  expect(complete.tracks[1].id).toBe('yt_1');
});

it('does not replace valid saved membership with an empty response', async () => {
  await rememberAlbumMetadata(album);
  await rememberAlbumMetadata({ ...album, tracks: [] });
  expect((await getRememberedAlbum(album.id))?.tracks).toHaveLength(11);
});

it('does not redirect a separate single to an album that shares its recording', async () => {
  await upsertCatalogTracks([{
    spotifyId: 'yt_0', title: 'Track 0', artistName: 'Ebony', albumName: 'Track 0',
    albumId: 'single-release', imageURL: 'single-artwork', duration_ms: 120000,
  }]);
  await rememberAlbumMetadata(album);
  expect((await getLibraryTracks())[0]).toMatchObject({ albumId: 'single-release', imageURL: 'single-artwork' });
  expect(await getRememberedAlbum('spotify:single-release')).toBeNull();
});
