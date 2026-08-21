import { PlaylistModel, TrackModel } from '@models';
import { PlaylistItemResponseType, PlaylistResponseType } from '@config';
import {
  fetchWithTimeout,
  parseFromPlaylistItemsToTracks,
  parseToPlaylist,
} from '@utils';

import { BASE_URL, MUSIC_SERVER_URL, spotifyGet } from '../config';

type BackendPlaylist = {
  id: string;
  title: string;
  coverUrl?: string;
  tracks: {
    spotifyId: string;
    title: string;
    artistName: string;
    albumName?: string;
    imageURL?: string;
    duration_ms?: number;
  }[];
};

const getBackendPlaylist = async (playlistId: string): Promise<BackendPlaylist> => {
  const response = await fetchWithTimeout(
    `${MUSIC_SERVER_URL}/api/spotify/playlist/${playlistId}`,
    {},
    15_000
  );
  if (!response.ok) throw new Error('Não foi possível buscar a playlist no servidor local.');

  return response.json() as Promise<BackendPlaylist>;
};

const parseBackendPlaylist = (playlist: BackendPlaylist): PlaylistModel => ({
  type: 'playlist',
  id: playlist.id,
  title: playlist.title,
  subtitle: 'Spotify',
  ownerId: 'spotify',
  info: '',
  description: '',
  imageURL: playlist.coverUrl || '',
  tracks: { total: playlist.tracks.length },
});

const parseBackendTracks = (playlist: BackendPlaylist): TrackModel[] =>
  playlist.tracks.map((track) => ({
    id: track.spotifyId,
    title: track.title,
    subtitle: track.artistName,
    albumName: track.albumName || playlist.title,
    imageURL: track.imageURL || '',
    durationMs: track.duration_ms || 0,
  }));

export const getPlaylist = async (
  playlistId: string
): Promise<PlaylistModel> => {
  try {
    return parseBackendPlaylist(await getBackendPlaylist(playlistId));
  } catch {
    // Server scraper is preferred because it works without browser CORS or
    // bundled Spotify client credentials. Official API stays as fallback.
  }

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
    const playlist = await getBackendPlaylist(playlistId);
    return parseBackendTracks(playlist).slice(offset, offset + limit);
  } catch {
    // Fallback below keeps signed-in/credentialed Spotify clients working.
  }

  try {
    const response = await spotifyGet<{ items: PlaylistItemResponseType[]; total: number }>(
      `${BASE_URL}/playlists/${playlistId}/tracks`,
      {
        params: {
          limit,
          offset,
          fields,
        },
      }
    );

    return parseFromPlaylistItemsToTracks(response.data.items);
  } catch (error) {
    console.error(`Error fetching playlist with an ID: ${playlistId}`, error);
    throw error;
  }
};
