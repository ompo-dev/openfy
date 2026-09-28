import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalPlaylist = {
  id: string;
  sourcePlatform: 'local' | 'spotify' | 'youtube';
  sourceId: string;
  title: string;
  description?: string;
  trackIds: string[];
  coverImageURLs?: string[];
  createdAt: string;
  updatedAt: string;
};

export type LocalPlaylistInput = Pick<
  LocalPlaylist,
  'sourcePlatform' | 'sourceId' | 'title' | 'trackIds'
> & { coverImageURLs?: string[]; description?: string };

export type LocalPlaylistUpdate = {
  title?: string;
  description?: string;
  trackIds?: string[];
  coverImageURLs?: string[];
};

const STORAGE_KEY = 'openfy_local_playlists';
let storageMutation = Promise.resolve();

const uniqueNonEmpty = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const createSourceId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const isLocalPlaylist = (value: unknown): value is LocalPlaylist => {
  if (!value || typeof value !== 'object') return false;
  const playlist = value as Partial<LocalPlaylist>;
  return (
    typeof playlist.id === 'string' &&
    (playlist.sourcePlatform === 'local' ||
      playlist.sourcePlatform === 'spotify' ||
      playlist.sourcePlatform === 'youtube') &&
    typeof playlist.sourceId === 'string' &&
    typeof playlist.title === 'string' &&
    (playlist.description === undefined || typeof playlist.description === 'string') &&
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
  const id = `local_${input.sourcePlatform}_${input.sourceId}`;
  let saved!: LocalPlaylist;
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    const current = playlists.find((playlist) => playlist.id === id);
    const now = new Date().toISOString();
    saved = {
      id,
      sourcePlatform: input.sourcePlatform,
      sourceId: input.sourceId,
      title:
        input.title.trim() ||
        current?.title ||
        (input.sourcePlatform === 'local' ? 'Nova playlist' : 'Playlist importada'),
      ...(input.description?.trim() || current?.description
        ? { description: input.description?.trim() || current?.description }
        : {}),
      trackIds: uniqueNonEmpty(input.trackIds),
      coverImageURLs: uniqueNonEmpty(
        input.coverImageURLs || current?.coverImageURLs || []
      ).slice(0, 4),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        ...playlists.filter((candidate) => candidate.id !== id),
        saved,
      ])
    );
  });
  storageMutation = operation.catch(() => {});
  await operation;
  return saved;
};

export const createLocalPlaylist = (
  title: string,
  description = ''
): Promise<LocalPlaylist> =>
  upsertLocalPlaylist({
    sourcePlatform: 'local',
    sourceId: createSourceId(),
    title,
    description,
    trackIds: [],
  });

export const updateLocalPlaylist = async (
  playlistId: string,
  update: LocalPlaylistUpdate
): Promise<LocalPlaylist | null> => {
  let saved: LocalPlaylist | null = null;
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    const current = playlists.find((playlist) => playlist.id === playlistId);
    if (!current) return;

    const title = update.title === undefined
      ? current.title
      : update.title.trim() || current.title;
    const description = update.description === undefined
      ? current.description
      : update.description.trim() || undefined;
    saved = {
      ...current,
      title,
      ...(description ? { description } : {}),
      ...(!description && update.description !== undefined
        ? { description: undefined }
        : {}),
      trackIds: update.trackIds
        ? uniqueNonEmpty(update.trackIds)
        : current.trackIds,
      coverImageURLs: update.coverImageURLs
        ? uniqueNonEmpty(update.coverImageURLs).slice(0, 4)
        : current.coverImageURLs,
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        playlists.map((playlist) =>
          playlist.id === playlistId ? saved : playlist
        )
      )
    );
  });
  storageMutation = operation.catch(() => {});
  await operation;
  return saved;
};

export const addTracksToLocalPlaylist = async (
  playlistId: string,
  trackIds: string[]
): Promise<LocalPlaylist | null> => {
  let saved: LocalPlaylist | null = null;
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    const current = playlists.find((playlist) => playlist.id === playlistId);
    if (!current) return;
    saved = {
      ...current,
      trackIds: uniqueNonEmpty([...current.trackIds, ...trackIds]),
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        playlists.map((playlist) =>
          playlist.id === playlistId ? saved : playlist
        )
      )
    );
  });
  storageMutation = operation.catch(() => {});
  await operation;
  return saved;
};

export const removeTracksFromLocalPlaylist = async (
  playlistId: string,
  trackIds: string[]
): Promise<LocalPlaylist | null> => {
  const removed = new Set(trackIds);
  let saved: LocalPlaylist | null = null;
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    const current = playlists.find((playlist) => playlist.id === playlistId);
    if (!current) return;
    saved = {
      ...current,
      trackIds: current.trackIds.filter((trackId) => !removed.has(trackId)),
      updatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        playlists.map((playlist) =>
          playlist.id === playlistId ? saved : playlist
        )
      )
    );
  });
  storageMutation = operation.catch(() => {});
  await operation;
  return saved;
};

export const deleteLocalPlaylist = async (playlistId: string): Promise<void> => {
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(playlists.filter((playlist) => playlist.id !== playlistId))
    );
  });
  storageMutation = operation.catch(() => {});
  await operation;
};

export const removeTrackFromLocalPlaylists = async (
  trackId: string
): Promise<void> => {
  const operation = storageMutation.then(async () => {
    const playlists = await getLocalPlaylists();
    const next = playlists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((id) => id !== trackId),
      updatedAt: playlist.trackIds.includes(trackId)
        ? new Date().toISOString()
        : playlist.updatedAt,
    }));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  storageMutation = operation.catch(() => {});
  await operation;
};
