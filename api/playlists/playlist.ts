import { PlaylistModel, TrackModel } from '@models';
import { PlaylistItemResponseType, PlaylistResponseType } from '@config';
import { parseFromPlaylistItemsToTracks, parseToPlaylist } from '@utils';

import { BASE_URL, spotifyGet } from '../config';

const MUSIC_SERVER_URL = 'http://localhost:3001';

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
  const response = await fetch(
    `${MUSIC_SERVER_URL}/api/spotify/playlist/${playlistId}`,
    { signal: AbortSignal.timeout(15_000) }
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
    const response = await spotifyGet<PlaylistResponseType>(
      `${BASE_URL}/playlists/${playlistId}`
    );

    return parseToPlaylist(response.data);
  } catch (error) {
    try {
      return parseBackendPlaylist(await getBackendPlaylist(playlistId));
    } catch {
      console.error(`Error fetching playlist with an ID: ${playlistId}`, error);
      throw error;
    }
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
    try {
      const playlist = await getBackendPlaylist(playlistId);
      return parseBackendTracks(playlist).slice(offset, offset + limit);
    } catch {
      console.error(`Error fetching playlist with an ID: ${playlistId}`, error);
      throw error;
    }
  }
};
