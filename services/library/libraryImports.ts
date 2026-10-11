import {
  getDownloadedTracks, getLibraryTracks, getLocalPlaylists, isTrackDownloaded,
  parseSpotifyLink, upsertCatalogTracks, upsertLocalPlaylist,
} from '@services';
import { fetchSpotifyCollectionMetadata, fetchSpotifyTrackMetadata, type SpotifyArtist } from '../metadata/spotifyMetadata';
import type { TrackAlbumRef } from '../../models/Track/TrackModel';
import axios from 'axios';
import { notifyLibraryImport, prepareImportNotifications, type ImportDestination } from '../background/importNotifications';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { prefetchImages } from '../images/imagePrefetch';
import { rememberDetailPreview } from '../navigation/detailPreview';

export type TrackPreview = {
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  artists?: SpotifyArtist[];
  albumId?: string;
  albumAssociations?: TrackAlbumRef[];
  albumArtists?: SpotifyArtist[];
  trackNumber?: number;
  discNumber?: number;
  imageURL: string;
  duration_ms: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  audioUrl?: string;
  audioFormat?: string;
  isDownloaded?: boolean;
};

type ImportedPlaylist = {
  sourcePlatform: 'spotify' | 'youtube';
  sourceId: string;
  title: string;
};

const fetchPlaylistOrAlbum = async (
  id: string,
  type: 'playlist' | 'album'
): Promise<{ title: string; coverUrl: string; tracks: TrackPreview[] }> => {
  const collection = await fetchSpotifyCollectionMetadata(id, type);
  if (!collection) return { title: '', coverUrl: '', tracks: [] };
  const downloadedIds = new Set(
    (await getDownloadedTracks()).map((track) => track.spotifyId)
  );
  return {
    ...collection,
    tracks: collection.tracks.map((track) => ({
      ...track,
      isDownloaded: downloadedIds.has(track.spotifyId),
    })),
  };
};

const fetchYouTubeTrack = async (
  videoId: string
): Promise<TrackPreview | null> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const trackId = `yt_${videoId}`;
  const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
  const timer = setTimeout(() => controller?.abort(), 7000);
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { signal: controller?.signal }
    );
    if (!response.ok) return null;
    const metadata = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!metadata.title) return null;
    return {
      spotifyId: trackId,
      title: metadata.title,
      artistName: metadata.author_name || 'YouTube',
      albumName: 'YouTube',
      imageURL:
        metadata.thumbnail_url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration_ms: 0,
      youtubeVideoId: videoId,
      youtubeUrl,
      isDownloaded: await isTrackDownloaded(trackId),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchYouTubePlaylist = async (
  playlistId: string
): Promise<{ title: string; tracks: TrackPreview[] }> => {
  const gateways = [
    `https://inv.nadeko.net/api/v1/playlists/${playlistId}`,
    `https://invidious.f5.si/api/v1/playlists/${playlistId}`,
  ];

  for (const gw of gateways) {
    try {
      const res = await axios.get(gw, { timeout: 6000 });
      const data = res.data;
      if (data && data.videos && Array.isArray(data.videos)) {
        const downloadedIds = new Set((await getDownloadedTracks()).map((track) => track.spotifyId));
        const list: TrackPreview[] = [];
        for (const v of data.videos) {
          const trackId = `yt_${v.videoId}`;
          const already = downloadedIds.has(trackId);
          list.push({
            spotifyId: trackId,
            title: v.title || 'Música',
            artistName: v.author || data.author || 'YouTube Music',
            albumName: data.title || 'YouTube Playlist',
            imageURL:
              v.videoThumbnails?.[0]?.url ||
              `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            duration_ms: (v.lengthSeconds || 0) * 1000,
            youtubeVideoId: v.videoId,
            isDownloaded: already,
          });
        }
        if (list.length > 0) {
          return { title: data.title || 'YouTube Playlist', tracks: list };
        }
      }
    } catch {}
  }
  return { title: '', tracks: [] };
};


export type ImportJob = {
  key: string;
  status: 'ready' | 'loading' | 'completed' | 'error';
  tracks: TrackPreview[];
  playlist: ImportedPlaylist | null;
  title: string;
  error: string;
  destination?: ImportDestination;
};
const jobs = new Map<string, ImportJob>();
const requests = new Map<string, Promise<ImportJob>>();
const listeners = new Set<(job: ImportJob) => void>();
export const getImportJob = (key: string) => jobs.get(key);
export const _clearLibraryImportsForTests = () => { jobs.clear(); requests.clear(); listeners.clear(); };
export const subscribeImports = (listener: (job: ImportJob) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const publish = (job: ImportJob) => {
  jobs.delete(job.key);
  jobs.set(job.key, job);
  // Never evict a running import. Retain recent resolved metadata for retries/reopens.
  if (jobs.size > 20) {
    const oldest = [...jobs.values()].find((item) => item.status !== 'loading' && item.key !== job.key);
    if (oldest) jobs.delete(oldest.key);
  }
  listeners.forEach((listener) => {
    try { listener(job); } catch (error) { console.warn('[LibraryImport] listener failed', error); }
  });
  return job;
};

export const revalidateImport = async (key: string) => {
  const job = jobs.get(key);
  if (!job || job.status !== 'completed' || requests.has(key)) return;
  const [tracks, playlists] = await Promise.all([
    getLibraryTracks(), job.playlist ? getLocalPlaylists() : Promise.resolve([]),
  ]);
  if (jobs.get(key) !== job || requests.has(key)) return;
  const ids = new Set(tracks.map((track) => track.spotifyId));
  if (!job.tracks.every((track) => ids.has(track.spotifyId)) ||
    (job.playlist && !playlists.some((playlist) => playlist.sourcePlatform === job.playlist?.sourcePlatform &&
      playlist.sourceId === job.playlist.sourceId))) {
    publish({ ...job, status: 'ready', destination: undefined, error: '' });
  }
};

/** Owned by the app service, not a mounted sheet; closing/navigating cannot cancel it. */
export const startLibraryImport = (input: string): Promise<ImportJob> => {
  const parsed = parseSpotifyLink(input.trim());
  if (!parsed) return Promise.reject(new Error('Link inválido.'));
  const key = `${parsed.platform}:${parsed.type}:${parsed.id}`;
  const pending = requests.get(key);
  if (pending) return pending;
  const previous = jobs.get(key);
  if (previous?.status === 'completed') return Promise.resolve(previous);
  const permission = prepareImportNotifications().catch(() => false);
  let job = publish({ key, status: 'loading', tracks: previous?.tracks || [],
    playlist: previous?.playlist || null, title: previous?.title || '', error: '' });

  const request = (async () => {
    try {
      if (!job.tracks.length) {
        let tracks: TrackPreview[] = [];
        let playlist: ImportedPlaylist | null = null;
        let title = '';
        if (parsed.platform === 'youtube') {
          if (parsed.type === 'track') {
            const track = await fetchYouTubeTrack(parsed.id);
            if (track) { tracks = [track]; title = track.title; }
          } else {
            const result = await fetchYouTubePlaylist(parsed.id);
            tracks = result.tracks;
            title = result.title;
            playlist = { sourcePlatform: 'youtube', sourceId: parsed.id, title };
          }
        } else if (parsed.type === 'track') {
          const track = await fetchSpotifyTrackMetadata(parsed.id);
          if (track) {
            tracks = [{ ...track, isDownloaded: await isTrackDownloaded(track.spotifyId) }];
            title = track.title;
          }
        } else {
          const result = await fetchPlaylistOrAlbum(parsed.id, parsed.type);
          tracks = parsed.type === 'album' ? result.tracks.map((track) => ({
            ...track, albumAssociations: [
              ...(track.albumAssociations || []),
              { id: parsed.id, name: result.title, imageURL: result.coverUrl || track.imageURL,
                albumArtists: track.albumArtists, trackNumber: track.trackNumber, discNumber: track.discNumber },
            ],
          })) : result.tracks;
          title = result.title;
          if (parsed.type === 'playlist') playlist = { sourcePlatform: 'spotify', sourceId: parsed.id, title };
        }
        if (!tracks.length) throw new Error('Nenhuma música encontrada. Verifique o link e tente novamente.');
        job = publish({ ...job, tracks, playlist, title });
        void prefetchImages(tracks.slice(0, 4).flatMap((track) =>
          [track.imageURL, ...(track.albumAssociations?.map((album) => album.imageURL || '') || [])])).catch(() => {});
      }
      await upsertCatalogTracks(job.tracks);
      let destination: ImportDestination = { kind: 'track', id: job.tracks[0].spotifyId };
      if (job.playlist) {
        const saved = await upsertLocalPlaylist({ ...job.playlist,
          trackIds: job.tracks.map((track) => track.spotifyId),
          coverImageURLs: job.tracks.map((track) => track.imageURL).filter(Boolean) });
        destination = { kind: 'playlist', id: saved.id };
      } else if (parsed.type === 'album') {
        destination = { kind: 'album', id: `local_album_${encodeURIComponent(`spotify:${parsed.id}`)}` };
      }
      if (destination.kind !== 'track') {
        const imageURL = destination.kind === 'album'
          ? job.tracks[0].albumAssociations?.find((album) => album.id === parsed.id)?.imageURL || job.tracks[0].imageURL
          : job.tracks[0].imageURL;
        rememberDetailPreview(destination.kind, destination.id, { title: job.title, imageURL,
          imageURLs: [...new Set(job.tracks.map((track) => track.imageURL).filter(Boolean))].slice(0, 4),
          artists: destination.kind === 'album' ? job.tracks[0].albumArtists : undefined,
          trackCount: job.tracks.length,
          tracks: job.tracks.slice(0, 12).map((track) => ({ ...track, id: track.spotifyId,
            subtitle: track.artistName, durationMs: track.duration_ms })),
        });
      }
      useLibraryStore.getState().refreshLibrary();
      job = publish({ ...job, status: 'completed', destination });
      // Permission and notification failures must not turn a successful import into a failure.
      void permission.then(async (allowed) => {
        if (allowed) await notifyLibraryImport(job.title, destination);
      }).catch(() => {});
    } catch (error) {
      job = publish({ ...job, status: 'error', error: error instanceof Error && error.message.startsWith('Nenhuma')
        ? error.message : 'Erro ao buscar dados. Verifique o link e tente novamente.' });
    }
    return job;
  })();
  requests.set(key, request);
  void request.finally(() => { if (requests.get(key) === request) requests.delete(key); });
  return request;
};
