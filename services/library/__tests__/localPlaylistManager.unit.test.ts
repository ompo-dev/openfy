import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getLocalPlaylist,
  getLocalPlaylists,
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
});
