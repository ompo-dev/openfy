import { PlaylistModel, TrackModel } from '@models';
import { PlaylistItemResponseType, PlaylistResponseType } from '@config';
import { parseFromPlaylistItemsToTracks, parseToPlaylist } from '@utils';

import { BASE_URL, spotifyGet } from '../config';

export const getPlaylist = async (
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

export const getPlaylistItems = async ({
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
