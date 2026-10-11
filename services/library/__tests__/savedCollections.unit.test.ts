import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCatalogTracks, upsertCatalogTracks } from '../catalogLibrary';
import { getLocalPlaylists } from '../localPlaylistManager';
import { groupLocalAlbums } from '../localCollections';
import { isCollectionSaved, saveCollection } from '../savedCollections';

jest.mock('../../download/downloadManager', () => ({ getDownloadedTracks: jest.fn().mockResolvedValue([]) }));

const track = { spotifyId: 'kia', title: 'KIA', artistName: 'Ebony', albumName: 'KM2', albumId: 'km2',
  imageURL: 'https://images.test/km2.jpg', duration_ms: 150000 };
beforeEach(async () => { await AsyncStorage.clear(); });

it('saves a radio snapshot once without downloading audio', async () => {
  const input = { kind: 'playlist' as const, id: 'home_mix_radio_sotam', title: 'Rádio de Sotam',
    imageURL: track.imageURL, tracks: [track] };
  await saveCollection(input);
  await saveCollection(input);
  expect(await getLocalPlaylists()).toEqual([expect.objectContaining({
    id: 'local_local_home_mix_radio_sotam', title: input.title, trackIds: ['kia'], coverImageURLs: [track.imageURL],
  })]);
  await expect(isCollectionSaved('playlist', input.id, [])).resolves.toBe(true);
  expect(await getCatalogTracks()).toHaveLength(1);
});

it('saves the whole album and preserves membership in another release', async () => {
  await upsertCatalogTracks([track]);
  await expect(isCollectionSaved('album', 'deluxe', [track])).resolves.toBe(false);
  await saveCollection({ kind: 'album', id: 'deluxe', title: 'KM2 de luxo', imageURL: 'https://images.test/deluxe.jpg',
    tracks: [track, { ...track, spotifyId: 'new-song', title: 'Nova', trackNumber: 2, discNumber: 2 }] });
  const saved = await getCatalogTracks();
  const albums = groupLocalAlbums(saved.map((item) => ({ ...item, id: item.spotifyId, isDownloaded: false })));
  expect(albums.find((album) => album.id === 'spotify:km2')?.tracks).toHaveLength(2);
  expect(albums.find((album) => album.id === 'spotify:deluxe')?.tracks).toHaveLength(2);
  expect(saved.find((item) => item.spotifyId === 'new-song')?.discNumber).toBe(2);
  await expect(isCollectionSaved('album', 'deluxe', saved, 2)).resolves.toBe(true);
  await expect(isCollectionSaved('album', 'deluxe', saved.slice(0, 1), 2)).resolves.toBe(false);
});

it('uses the catalog album id without creating a duplicate YouTube album', async () => {
  const ytTrack = { ...track, spotifyId: 'yt_song', albumId: 'MPREtest' };
  await saveCollection({ kind: 'album', id: 'ytalbum_MPREtest', title: 'KM2', imageURL: track.imageURL, tracks: [ytTrack] });
  const saved = await getCatalogTracks();
  const albums = groupLocalAlbums(saved.map((item) => ({ ...item, id: item.spotifyId, isDownloaded: false })));
  expect(albums).toHaveLength(1);
  await expect(isCollectionSaved('album', 'ytalbum_MPREtest', saved)).resolves.toBe(true);
});
