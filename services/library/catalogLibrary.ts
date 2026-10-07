import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getDownloadedTracks,
  type DownloadedTrack,
  type DownloadTrackInput,
} from '../download/downloadManager';
import { removeTrackFromLocalPlaylists } from './localPlaylistManager';
import { albumAssociationsForTrack, mergeAlbumAssociations, type TrackAlbumRef } from '../../models/Track/TrackModel';

export type CatalogSourcePlatform = 'spotify' | 'youtube';

export type CatalogTrackInput = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
  albumId?: string;
  albumAssociations?: TrackAlbumRef[];
  artists?: { id: string; name: string }[];
  albumArtists?: { id: string; name: string }[];
  trackNumber?: number;
  discNumber?: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  sourcePlatform?: CatalogSourcePlatform;
};

export type CatalogTrack = CatalogTrackInput & {
  sourcePlatform: CatalogSourcePlatform;
  addedAt: string;
  updatedAt: string;
};

export type LibraryTrack = CatalogTrack & {
  id: string;
  isDownloaded: boolean;
  localAudioPath?: string;
  localImagePath?: string;
  downloadedAt?: string;
  audioUrl?: string;
  metadataVersion?: number;
};

const STORAGE_KEY = 'openfy_catalog_tracks_v1';
let storageMutation = Promise.resolve();
let libraryTracksRequest: Promise<LibraryTrack[]> | null = null;

const sourcePlatformFrom = (
  track: Pick<CatalogTrackInput, 'spotifyId' | 'youtubeVideoId' | 'sourcePlatform'>
): CatalogSourcePlatform =>
  track.sourcePlatform ||
  (track.youtubeVideoId || track.spotifyId.startsWith('yt_') ? 'youtube' : 'spotify');

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isCatalogTrack = (value: unknown): value is CatalogTrack => {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<CatalogTrack>;
  return (
    nonEmptyString(track.spotifyId) &&
    nonEmptyString(track.title) &&
    typeof track.artistName === 'string' &&
    typeof track.albumName === 'string' &&
    typeof track.imageURL === 'string' &&
    typeof track.duration_ms === 'number' &&
    Number.isFinite(track.duration_ms) &&
    (track.sourcePlatform === 'spotify' || track.sourcePlatform === 'youtube') &&
    nonEmptyString(track.addedAt) &&
    nonEmptyString(track.updatedAt)
  );
};

const normalizeArtists = (
  artists?: { id: string; name: string }[]
): { id: string; name: string }[] | undefined => {
  if (!artists?.length) return undefined;
  const unique = new Map<string, { id: string; name: string }>();
  for (const artist of artists) {
    const name = artist.name?.trim();
    if (!name) continue;
    const id = artist.id?.trim() || '';
    unique.set(id || name.toLocaleLowerCase(), { id, name });
  }
  return unique.size ? [...unique.values()] : undefined;
};

const normalizeAlbumAssociations = (albums?: TrackAlbumRef[]) =>
  mergeAlbumAssociations(albums?.map((album) => ({
    ...album,
    id: album.id?.trim() || album.name?.trim() || '',
    name: album.name?.trim() || album.id?.trim() || '',
    imageURL: album.imageURL?.trim() || undefined,
    albumArtists: normalizeArtists(album.albumArtists),
  })));

const normalizeInput = (
  input: CatalogTrackInput,
  current?: CatalogTrack
): CatalogTrack => {
  const now = new Date().toISOString();
  const albumAssociations = normalizeAlbumAssociations([
    ...(current ? albumAssociationsForTrack(current) || [] : []),
    ...(input.albumAssociations || []),
    ...(albumAssociationsForTrack(input) || []),
  ]);
  return {
    spotifyId: input.spotifyId.trim(),
    title: input.title.trim() || current?.title || 'Música',
    artistName: input.artistName.trim() || current?.artistName || 'Artista',
    albumName: input.albumName.trim() || current?.albumName || 'Single',
    imageURL: input.imageURL.trim() || current?.imageURL || '',
    duration_ms:
      Number.isFinite(input.duration_ms) && input.duration_ms > 0
        ? input.duration_ms
        : current?.duration_ms || 0,
    sourcePlatform: sourcePlatformFrom(input),
    addedAt: current?.addedAt || now,
    updatedAt: now,
    ...(input.albumId?.trim() || current?.albumId
      ? { albumId: input.albumId?.trim() || current?.albumId }
      : {}),
    ...(albumAssociations ? { albumAssociations } : {}),
    ...(normalizeArtists(input.artists) || current?.artists
      ? { artists: normalizeArtists(input.artists) || current?.artists }
      : {}),
    ...(normalizeArtists(input.albumArtists) || current?.albumArtists
      ? {
          albumArtists:
            normalizeArtists(input.albumArtists) || current?.albumArtists,
        }
      : {}),
    ...(input.trackNumber || current?.trackNumber
      ? { trackNumber: input.trackNumber || current?.trackNumber }
      : {}),
    ...(input.discNumber || current?.discNumber
      ? { discNumber: input.discNumber || current?.discNumber }
      : {}),
    ...(input.youtubeVideoId || current?.youtubeVideoId
      ? { youtubeVideoId: input.youtubeVideoId || current?.youtubeVideoId }
      : {}),
    ...(input.youtubeUrl || current?.youtubeUrl
      ? { youtubeUrl: input.youtubeUrl || current?.youtubeUrl }
      : {}),
  };
};

const catalogInputFromDownload = (track: DownloadedTrack): CatalogTrackInput => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.imageURL,
  duration_ms: track.duration_ms,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
  artists: track.artists,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});

export const getCatalogTracks = async (): Promise<CatalogTrack[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isCatalogTrack) : [];
  } catch {
    return [];
  }
};

export const upsertCatalogTracks = async (
  inputs: CatalogTrackInput[]
): Promise<CatalogTrack[]> => {
  const validInputs = inputs.filter(
    (track) => nonEmptyString(track.spotifyId) && nonEmptyString(track.title)
  );
  if (!validInputs.length) return getCatalogTracks();

  let saved: CatalogTrack[] = [];
  const operation = storageMutation.then(async () => {
    const current = await getCatalogTracks();
    const byId = new Map(current.map((track) => [track.spotifyId, track]));
    const touchedIds = new Set<string>();
    for (const input of validInputs) {
      const normalized = normalizeInput(input, byId.get(input.spotifyId));
      byId.set(normalized.spotifyId, normalized);
      touchedIds.add(normalized.spotifyId);
    }
    saved = [
      ...current
        .filter((track) => !touchedIds.has(track.spotifyId))
        .map((track) => byId.get(track.spotifyId)!),
      ...[...touchedIds].map((id) => byId.get(id)!),
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  });
  storageMutation = operation.catch(() => {});
  await operation;
  return saved;
};

/** Remove catalog-only entries and detach them from every local playlist. */
export const removeCatalogTracks = async (
  spotifyIds: string[]
): Promise<number> => {
  const ids = new Set(spotifyIds.map((id) => id.trim()).filter(Boolean));
  if (!ids.size) return 0;

  let removed = 0;
  const operation = storageMutation.then(async () => {
    const current = await getCatalogTracks();
    const next = current.filter((track) => !ids.has(track.spotifyId));
    removed = current.length - next.length;
    if (removed > 0) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  });
  storageMutation = operation.catch(() => {});
  await operation;
  await Promise.all([...ids].map(removeTrackFromLocalPlaylists));
  return removed;
};

export const removeCatalogTrack = (spotifyId: string): Promise<number> =>
  removeCatalogTracks([spotifyId]);

const loadLibraryTracks = async (): Promise<LibraryTrack[]> => {
  const [catalogTracks, downloadedTracks] = await Promise.all([
    getCatalogTracks(),
    getDownloadedTracks(),
  ]);
  const downloadedById = new Map(
    downloadedTracks.map((track) => [track.spotifyId, track])
  );
  const catalogIds = new Set(catalogTracks.map((track) => track.spotifyId));
  const mergedCatalog = catalogTracks.map((catalogTrack): LibraryTrack => {
    const downloaded = downloadedById.get(catalogTrack.spotifyId);
    if (!downloaded) {
      return {
        ...catalogTrack,
        id: `catalog_${catalogTrack.spotifyId}`,
        isDownloaded: false,
      };
    }
    return {
      ...Object.fromEntries(
        Object.entries(downloaded).filter(([, value]) =>
          typeof value === 'string' ? value.trim().length > 0 : value != null
        )
      ),
      ...catalogTrack,
      id: downloaded.id,
      imageURL: catalogTrack.imageURL || downloaded.imageURL,
      duration_ms: catalogTrack.duration_ms || downloaded.duration_ms,
      artists: catalogTrack.artists?.length
        ? catalogTrack.artists
        : downloaded.artists,
      albumId: catalogTrack.albumId || downloaded.albumId,
      albumAssociations: mergeAlbumAssociations(
        catalogTrack.albumAssociations,
        downloaded.albumAssociations,
      ),
      albumArtists: catalogTrack.albumArtists?.length
        ? catalogTrack.albumArtists
        : downloaded.albumArtists,
      trackNumber: catalogTrack.trackNumber || downloaded.trackNumber,
      discNumber: catalogTrack.discNumber || downloaded.discNumber,
      youtubeVideoId:
        catalogTrack.youtubeVideoId || downloaded.youtubeVideoId,
      youtubeUrl: catalogTrack.youtubeUrl || downloaded.youtubeUrl,
      audioUrl: downloaded.audioUrl,
      localImagePath: downloaded.localImagePath,
      localAudioPath: downloaded.localAudioPath,
      isDownloaded: true,
    } as LibraryTrack;
  });
  const downloadedOnly = downloadedTracks
    .filter((track) => !catalogIds.has(track.spotifyId))
    .map((track): LibraryTrack => {
      const timestamp = track.downloadedAt || new Date(0).toISOString();
      return {
        ...normalizeInput(catalogInputFromDownload(track)),
        ...track,
        sourcePlatform: sourcePlatformFrom(track),
        addedAt: timestamp,
        updatedAt: timestamp,
        isDownloaded: true,
      };
    });

  return [...mergedCatalog, ...downloadedOnly].sort((first, second) =>
    first.addedAt.localeCompare(second.addedAt)
  );
};

export const getLibraryTracks = (): Promise<LibraryTrack[]> => {
  if (libraryTracksRequest) return libraryTracksRequest;

  libraryTracksRequest = loadLibraryTracks()
    .finally(() => {
      libraryTracksRequest = null;
    });
  return libraryTracksRequest;
};

export const toDownloadTrackInput = (
  track: CatalogTrackInput
): DownloadTrackInput => ({
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.imageURL,
  duration_ms: track.duration_ms,
  albumId: track.albumId,
  albumAssociations: track.albumAssociations,
  artists: track.artists,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
});
