import { PlaylistModel, TrackModel } from '@models';
import { PlaylistItemResponseType, PlaylistResponseType } from '@config';
import { parseFromPlaylistItemsToTracks, parseToPlaylist } from '@utils';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

import { BASE_URL, spotifyGet } from '../config';

const playlistCache = createAsyncResourceCache<PlaylistModel>({
  name: 'spotify playlist',
  category: 'network',
  maxEntries: 40,
});
const playlistItemsCache = createAsyncResourceCache<TrackModel[]>({
  name: 'spotify playlist page',
  category: 'network',
  maxEntries: 120,
});

const loadPlaylist = async (
  playlistId: string
): Promise<PlaylistModel> => {
  try {
    const response = await spotifyGet<PlaylistResponseType>(
      `${BASE_URL}/playlists/${playlistId}`
    );

    return parseToPlaylist(response.data);
  } catch (error) {
    console.error(`Error fetching playlist with an ID: ${playlistId}`, error);
    throw error;
  }
};

export const getPlaylist = (playlistId: string): Promise<PlaylistModel> =>
  playlistCache.getOrLoad(playlistId, () => loadPlaylist(playlistId), 15 * 60_000);

const loadPlaylistItems = async ({
  playlistId,
  fields = 'items.track(id,name,artists(id,name),album(name,images(url)),duration_ms,explicit)',
  limit,
  offset,
}: {
  playlistId: string;
  fields?: string;
  limit: number;
  offset: number;
}): Promise<TrackModel[]> => {
  try {
    const response = await spotifyGet<{
      items: PlaylistItemResponseType[];
      total: number;
    }>(`${BASE_URL}/playlists/${playlistId}/tracks`, {
      params: {
        limit,
        offset,
        fields,
      },
    });

    return parseFromPlaylistItemsToTracks(response.data.items);
  } catch (error) {
    console.error(`Error fetching playlist with an ID: ${playlistId}`, error);
    throw error;
  }
};

export const getPlaylistItems = (input: {
  playlistId: string;
  fields?: string;
  limit: number;
  offset: number;
}): Promise<TrackModel[]> => {
  const fields = input.fields || 'items.track(id,name,artists(id,name),album(name,images(url)),duration_ms,explicit)';
  const key = `${input.playlistId}:${input.limit}:${input.offset}:${fields}`;
  return playlistItemsCache.getOrLoad(
    key,
    () => loadPlaylistItems({ ...input, fields }),
    10 * 60_000
  );
};

export const _clearPlaylistCachesForTests = () => {
  playlistCache.clear();
  playlistItemsCache.clear();
};
