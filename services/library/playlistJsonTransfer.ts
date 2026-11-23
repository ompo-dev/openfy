import { getCatalogMapping, setCatalogMappingsBatch, type CatalogMapping } from '../audio/catalogMappingCache';
import { getTrackYouTubeVideoId } from '../spotify/linkParser';
import { upsertCatalogTracks, type CatalogTrackInput } from './catalogLibrary';
import { upsertLocalPlaylist, type LocalPlaylist } from './localPlaylistManager';
import { clearTrackUnavailableMany } from '../../stores/useTrackAvailabilityStore';
import { useLibraryStore } from '../../stores/useLibraryStore';

/**
 * Openfy playlist interchange. Copies metadata and stable user-selected source
 * references, not downloaded audio, sandbox paths, cookies or ephemeral signed
 * CDN URLs. The receiving device still resolves stream transport when playing.
 */
const FORMAT = 'openfy.playlist';
const VERSION = 1;
export const MAX_PLAYLIST_JSON_LENGTH = 3_000_000;
const MAX_TRACKS = 2_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

type SourceMapping = Pick<CatalogMapping, 'videoId' | 'source' | 'confidence'>;
export type PortableTrack = CatalogTrackInput & { sourceMapping?: SourceMapping };
export type PlaylistTransferTrack = Partial<CatalogTrackInput> & {
  id?: string;
  spotifyId?: string;
  title: string;
  artistName?: string;
  subtitle?: string;
  durationMs?: number;
};
export type PortablePlaylist = {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  playlist: {
    id: string;
    title: string;
    description?: string;
    createdAt?: string;
    coverImageURLs: string[];
  };
  tracks: PortableTrack[];
};
export type PlaylistTransferInput = {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  imageURL?: string;
  imageURLs?: string[];
  tracks: PlaylistTransferTrack[];
};

const stringValue = (value: unknown, limit = 512): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

/** Signed temporary CDN URLs and their bearer parameters must not be shared. */
const portableUrl = (value: unknown): string | undefined => {
  const raw = stringValue(value, 2048);
  if (!raw || raw.length > 2000) return undefined;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname ||
        url.username || url.password || /(^|\.)googlevideo\.com$/i.test(url.hostname)) return undefined;
    for (const key of url.searchParams.keys()) {
      if (/^(?:token|auth|authorization|signature|sig|expire|expires|expiry|key|policy|session|hdnts|x-amz-.*)$/i.test(key)) {
        return undefined;
      }
    }
    return url.toString();
  } catch { return undefined; }
};
const artists = (input: unknown): { id: string; name: string }[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const list = input.slice(0, 30).filter((entry) =>
    entry && typeof entry === 'object' && stringValue(entry.name).length > 0)
    .map((entry) => ({ id: stringValue(entry.id, 128), name: stringValue(entry.name, 256) }));
  return list.length ? list : undefined;
};
const albumAssociations = (input: unknown): CatalogTrackInput['albumAssociations'] => {
  if (!Array.isArray(input)) return undefined;
  const result = input.slice(0, 30).filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: stringValue(entry.id, 256),
      name: stringValue(entry.name, 256),
      imageURL: portableUrl(entry.imageURL),
      releaseDate: stringValue(entry.releaseDate, 32) || undefined,
      releaseType: ['album', 'single', 'ep', 'compilation', 'release'].includes(entry.releaseType)
        ? entry.releaseType as 'album' | 'single' | 'ep' | 'compilation' | 'release' : undefined,
      trackNumber: Number.isInteger(entry.trackNumber) && entry.trackNumber > 0 ? entry.trackNumber : undefined,
      discNumber: Number.isInteger(entry.discNumber) && entry.discNumber > 0 ? entry.discNumber : undefined,
      albumArtists: artists(entry.albumArtists),
    })).filter((entry) => entry.id && entry.name);
  return result.length ? result : undefined;
};

const normalizeTrack = (input: PlaylistTransferTrack): PortableTrack => {
  const id = stringValue(input.spotifyId || input.id, 256);
  const title = stringValue(input.title, 512);
  const artistName = stringValue(input.artistName || input.subtitle, 512);
  if (!id || !title || !artistName) throw new Error('Playlist contém uma música sem ID, título ou artista.');
  const youtubeVideoId = stringValue(input.youtubeVideoId, 32);
  const videoId = VIDEO_ID.test(youtubeVideoId)
    ? youtubeVideoId
    : getTrackYouTubeVideoId({ youtubeUrl: input.youtubeUrl, spotifyId: id });
  const duration = Number(input.duration_ms ?? input.durationMs ?? 0);
  const safeDuration = Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 86_400_000) : 0;
  const albumName = stringValue(input.albumName, 512) || 'Single';
  const result: PortableTrack = {
    spotifyId: id, title, artistName, albumName,
    imageURL: portableUrl(input.imageURL) || '',
    duration_ms: safeDuration,
    sourcePlatform: input.sourcePlatform === 'youtube' || id.startsWith('yt_') ? 'youtube' : 'spotify',
  };
  const extras: Partial<PortableTrack> = {
    isrc: stringValue(input.isrc, 24) || undefined,
    artistCreditsVersion: typeof input.artistCreditsVersion === 'number' ? input.artistCreditsVersion : undefined,
    albumId: stringValue(input.albumId, 256) || undefined,
    albumAssociations: albumAssociations(input.albumAssociations),
    artists: artists(input.artists),
    albumArtists: artists(input.albumArtists),
    trackNumber: Number.isInteger(input.trackNumber) && input.trackNumber! > 0 ? input.trackNumber : undefined,
    discNumber: Number.isInteger(input.discNumber) && input.discNumber! > 0 ? input.discNumber : undefined,
    releaseDate: stringValue(input.releaseDate, 32) || undefined,
    releaseType: ['album', 'single', 'ep', 'compilation', 'release'].includes(input.releaseType || '')
      ? input.releaseType : undefined,
    viewCount: Number.isFinite(input.viewCount) ? input.viewCount : undefined,
    popularity: Number.isFinite(input.popularity) ? input.popularity : undefined,
    explicit: typeof input.explicit === 'boolean' ? input.explicit : undefined,
    youtubeVideoId: videoId,
    youtubeUrl: videoId ? 'https://www.youtube.com/watch?v=' + videoId : portableUrl(input.youtubeUrl),
    audioUrl: portableUrl(input.audioUrl),
    streamUrl: portableUrl(input.streamUrl),
  };
  Object.entries(extras).forEach(([key, value]) => {
    if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
  });
  return result;
};

const parseDocument = (raw: string): PortablePlaylist => {
  if (raw.length > MAX_PLAYLIST_JSON_LENGTH) throw new Error('JSON excede o limite de 3 MB.');
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error('JSON inválido. Copie uma playlist exportada pelo Openfy.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Formato de playlist inválido.');
  const doc = data as Record<string, unknown>;
  if (doc.format !== FORMAT || doc.version !== VERSION) {
    throw new Error('Formato ou versão de playlist não suportados.');
  }
  const source = doc.playlist as Record<string, unknown> | undefined;
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      !stringValue(source.id) || !stringValue(source.title)) {
    throw new Error('A playlist não possui identificador ou título.');
  }
  if (!Array.isArray(doc.tracks) || doc.tracks.length > MAX_TRACKS) {
    throw new Error('Quantidade de músicas inválida (máximo de 2.000).');
  }
  const seen = new Set<string>();
  const tracks = doc.tracks.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Metadados de música inválidos.');
    }
    const track = normalizeTrack(entry as PlaylistTransferTrack);
    if (seen.has(track.spotifyId)) throw new Error('Playlist contém IDs duplicados.');
    seen.add(track.spotifyId);
    const mapping = (entry as PortableTrack).sourceMapping;
    if (mapping && typeof mapping === 'object' && VIDEO_ID.test(mapping.videoId) &&
        ['user_direct', 'youtube_search', 'ytmusic'].includes(mapping.source) &&
        typeof mapping.confidence === 'number' && mapping.confidence >= 90) {
      track.sourceMapping = { videoId: mapping.videoId, source: mapping.source, confidence: 100 };
      track.youtubeVideoId = mapping.videoId;
      track.youtubeUrl = 'https://www.youtube.com/watch?v=' + mapping.videoId;
    }
    return track;
  });
  const coverURLs = Array.isArray(source.coverImageURLs)
    ? source.coverImageURLs.slice(0, 4).map(portableUrl).filter((v): v is string => Boolean(v)) : [];
  return {
    format: FORMAT, version: VERSION,
    exportedAt: stringValue(doc.exportedAt, 60) || new Date(0).toISOString(),
    playlist: {
      id: stringValue(source.id, 256),
      title: stringValue(source.title, 512),
      description: stringValue(source.description, 10_000) || undefined,
      createdAt: stringValue(source.createdAt, 60) || undefined,
      coverImageURLs: coverURLs,
    },
    tracks,
  };
};

export const parsePlaylistJson = (raw: string): PortablePlaylist => parseDocument(raw);

export const exportPlaylistJson = async (input: PlaylistTransferInput): Promise<string> => {
  if (input.tracks.length > MAX_TRACKS) throw new Error('A playlist possui mais de 2.000 músicas.');
  const mapped = await Promise.all(input.tracks.map(async (item) => {
    const track = normalizeTrack(item);
    const mapping = await getCatalogMapping(track.spotifyId);
    if (mapping && VIDEO_ID.test(mapping.videoId) && mapping.confidence >= 90) {
      track.sourceMapping = { videoId: mapping.videoId, confidence: mapping.confidence, source: mapping.source };
      track.youtubeVideoId = mapping.videoId;
      track.youtubeUrl = 'https://www.youtube.com/watch?v=' + mapping.videoId;
    }
    return track;
  }));
  const document: PortablePlaylist = {
    format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
    playlist: {
      id: stringValue(input.id, 256),
      title: stringValue(input.title, 512),
      description: stringValue(input.description, 10_000) || undefined,
      createdAt: stringValue(input.createdAt, 60) || undefined,
      // Collection artwork may be a file:// URL on the source device. Derive
      // portable cover URLs from track metadata as well so another phone can
      // reconstruct its playlist mosaic without inheriting private paths.
      coverImageURLs: [...new Set([input.imageURL, ...(input.imageURLs || []),
        ...input.tracks.map((track) => track.imageURL)].map(portableUrl)
        .filter((value): value is string => Boolean(value)))].slice(0, 4),
    },
    tracks: mapped,
  };
  if (!document.playlist.id || !document.playlist.title) throw new Error('Playlist incompleta.');
  const raw = JSON.stringify(document, null, 2);
  if (raw.length > MAX_PLAYLIST_JSON_LENGTH) throw new Error('JSON excede o limite de 3 MB.');
  return raw;
};

const fingerprint = (input: string): string => {
  // Deterministic import identity; pasting twice must not duplicate a playlist.
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};

export const importPlaylistJson = async (raw: string): Promise<{ playlist: LocalPlaylist; trackCount: number }> => {
  const doc = parseDocument(raw); // Validate before touching storage.
  const tracks = doc.tracks.map(({ sourceMapping, ...track }) => track);
  await upsertCatalogTracks(tracks);
  const now = Date.now();
  const mappings = doc.tracks.flatMap((track) => {
    const videoId = track.sourceMapping?.videoId || track.youtubeVideoId;
    if (!videoId || !VIDEO_ID.test(videoId)) return [];
    return [{
      spotifyId: track.spotifyId,
      mapping: {
        videoId, confirmedAt: now, confidence: 100,
        source: 'user_direct' as const,
      },
    }];
  });
  await setCatalogMappingsBatch(mappings);
  clearTrackUnavailableMany(tracks);
  const playlist = await upsertLocalPlaylist({
    sourcePlatform: 'local',
    sourceId: 'shared_' + fingerprint(doc.playlist.id),
    title: doc.playlist.title,
    description: doc.playlist.description,
    coverImageURLs: doc.playlist.coverImageURLs,
    trackIds: tracks.map((track) => track.spotifyId),
  });
  useLibraryStore.getState().refreshLibrary();
  return { playlist, trackCount: tracks.length };
};
