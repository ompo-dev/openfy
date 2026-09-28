import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addTracksToLocalPlaylist,
  createLocalPlaylist,
  deleteLocalPlaylist,
  getLocalPlaylist,
  getLocalPlaylists,
  removeTracksFromLocalPlaylist,
  updateLocalPlaylist,
  upsertLocalPlaylist,
} from '../localPlaylistManager';

describe('localPlaylistManager', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps one playlist per source and preserves its track order', async () => {
    const first = await upsertLocalPlaylist({
      sourcePlatform: 'spotify',
      sourceId: 'playlist-id',
      title: 'Minha playlist',
      trackIds: ['track-1', 'track-2', 'track-1'],
    });
    const updated = await upsertLocalPlaylist({
      sourcePlatform: 'spotify',
      sourceId: 'playlist-id',
      title: 'Minha playlist atualizada',
      trackIds: ['track-3', 'track-2'],
    });

    expect(first.id).toBe('local_spotify_playlist-id');
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.trackIds).toEqual(['track-3', 'track-2']);
    await expect(getLocalPlaylists()).resolves.toEqual([updated]);
    await expect(getLocalPlaylist(updated.id)).resolves.toEqual(updated);
  });

  it('deletes only the selected local playlist', async () => {
    const first = await upsertLocalPlaylist({
      sourcePlatform: 'spotify',
      sourceId: 'first',
      title: 'Primeira',
      trackIds: ['track-1'],
    });
    const second = await upsertLocalPlaylist({
      sourcePlatform: 'youtube',
      sourceId: 'second',
      title: 'Segunda',
      trackIds: ['track-2'],
    });

    await deleteLocalPlaylist(first.id);

    await expect(getLocalPlaylist(first.id)).resolves.toBeNull();
    await expect(getLocalPlaylists()).resolves.toEqual([second]);
  });

  it('creates and edits a device-local playlist without changing its identity', async () => {
    const created = await createLocalPlaylist('  Favoritas  ', '  Para treinar  ');

    expect(created).toMatchObject({
      sourcePlatform: 'local',
      title: 'Favoritas',
      description: 'Para treinar',
      trackIds: [],
    });

    await addTracksToLocalPlaylist(created.id, ['track-2', 'track-1', 'track-2']);
    await removeTracksFromLocalPlaylist(created.id, ['track-2']);
    const updated = await updateLocalPlaylist(created.id, {
      title: 'Favoritas atualizadas',
      description: '',
    });

    expect(updated).toMatchObject({
      id: created.id,
      sourcePlatform: 'local',
      sourceId: created.sourceId,
      title: 'Favoritas atualizadas',
      trackIds: ['track-1'],
    });
    expect(updated?.description).toBeUndefined();
  });
});
