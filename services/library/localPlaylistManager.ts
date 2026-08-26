import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalPlaylist = {
  id: string;
  sourcePlatform: 'spotify' | 'youtube';
  sourceId: string;
  title: string;
  trackIds: string[];
  coverImageURLs?: string[];
  createdAt: string;
  updatedAt: string;
};

export type LocalPlaylistInput = Pick<
  LocalPlaylist,
  'sourcePlatform' | 'sourceId' | 'title' | 'trackIds'
> & { coverImageURLs?: string[] };

const STORAGE_KEY = 'openfy_local_playlists';

const isLocalPlaylist = (value: unknown): value is LocalPlaylist => {
  if (!value || typeof value !== 'object') return false;
  const playlist = value as Partial<LocalPlaylist>;
  return (
    typeof playlist.id === 'string' &&
    (playlist.sourcePlatform === 'spotify' || playlist.sourcePlatform === 'youtube') &&
    typeof playlist.sourceId === 'string' &&
    typeof playlist.title === 'string' &&
    Array.isArray(playlist.trackIds) &&
    playlist.trackIds.every((trackId) => typeof trackId === 'string') &&
    (playlist.coverImageURLs === undefined ||
      (Array.isArray(playlist.coverImageURLs) &&
        playlist.coverImageURLs.every((url) => typeof url === 'string'))) &&
    typeof playlist.createdAt === 'string' &&
    typeof playlist.updatedAt === 'string'
  );
};

export const getLocalPlaylists = async (): Promise<LocalPlaylist[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLocalPlaylist) : [];
  } catch {
    return [];
  }
};

export const getLocalPlaylist = async (
  id: string
): Promise<LocalPlaylist | null> => {
  const playlists = await getLocalPlaylists();
  return playlists.find((playlist) => playlist.id === id) || null;
};

export const upsertLocalPlaylist = async (
  input: LocalPlaylistInput
): Promise<LocalPlaylist> => {
  const playlists = await getLocalPlaylists();
  const id = `local_${input.sourcePlatform}_${input.sourceId}`;
  const current = playlists.find((playlist) => playlist.id === id);
  const now = new Date().toISOString();
  const playlist: LocalPlaylist = {
    id,
    sourcePlatform: input.sourcePlatform,
    sourceId: input.sourceId,
    title: input.title.trim() || 'Playlist importada',
    trackIds: [...new Set(input.trackIds.filter((trackId) => trackId.trim()))],
    coverImageURLs: [
      ...new Set(
        (input.coverImageURLs || current?.coverImageURLs || []).filter((url) =>
          url.trim()
        )
      ),
    ].slice(0, 4),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      ...playlists.filter((candidate) => candidate.id !== id),
      playlist,
    ])
  );

  return playlist;
};

export const deleteLocalPlaylist = async (playlistId: string): Promise<void> => {
  const playlists = await getLocalPlaylists();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(playlists.filter((playlist) => playlist.id !== playlistId))
  );
};

export const removeTrackFromLocalPlaylists = async (
  trackId: string
): Promise<void> => {
  const playlists = await getLocalPlaylists();
  const next = playlists.map((playlist) => ({
    ...playlist,
    trackIds: playlist.trackIds.filter((id) => id !== trackId),
    updatedAt: playlist.trackIds.includes(trackId)
      ? new Date().toISOString()
      : playlist.updatedAt,
  }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};
