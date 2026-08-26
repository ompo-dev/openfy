import { Platform } from 'react-native';

import { resolveAudioUrl } from '../audio/audioResolver';
import { preloadAudio } from '../audio/playerService';

export type HomeTrackSeed = {
  key: string;
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
};

export type RefreshedHomeTrack = Omit<HomeTrackSeed, 'key'> & {
  streamUrl?: string;
  streamExpiresAt?: number;
};

const HOME_STREAM_TTL_MS = 10 * 60_000;
const MAX_CONCURRENT_HOME_RESOLVES = 4;

const requests = new Map<string, Promise<RefreshedHomeTrack | null>>();
const cachedTracks = new Map<
  string,
  { value: RefreshedHomeTrack; expiresAt: number }
>();
let activeResolves = 0;
const waitingResolvers: (() => void)[] = [];

const canonicalKey = (track: HomeTrackSeed) =>
  `${track.title}\u0000${track.artistName}\u0000${track.duration_ms}`.toLowerCase();

const runQueuedResolve = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (activeResolves >= MAX_CONCURRENT_HOME_RESOLVES) {
    await new Promise<void>((resolve) => waitingResolvers.push(resolve));
  }

  activeResolves += 1;
  try {
    return await operation();
  } finally {
    activeResolves -= 1;
    waitingResolvers.shift()?.();
  }
};

const resolveHomeTrack = (track: HomeTrackSeed) => {
  const key = canonicalKey(track);
  const cached = cachedTracks.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const active = requests.get(key);
  if (active) return active;

  const request = runQueuedResolve(async (): Promise<RefreshedHomeTrack | null> => {
    try {
      // Reuse playback's resolver: in an IPA it resolves directly on device;
      // in Expo development it can still use the local API route.
      const resolved = await resolveAudioUrl(
        track.title,
        track.artistName,
        track.spotifyId,
        track.duration_ms
      );
      if (!resolved?.url) {
        console.warn(
          `[HomeRefresh] No verified stream for "${track.artistName} - ${track.title}".`
        );
        return null;
      }

      const streamExpiresAt = Date.now() + HOME_STREAM_TTL_MS;
      const streamUrl = resolved.url;
      void preloadAudio(streamUrl);
      return {
        spotifyId: track.spotifyId,
        title: track.title,
        artistName: track.artistName,
        albumName: track.albumName,
        imageURL: resolved.imageURL || track.imageURL,
        duration_ms: track.duration_ms,
        streamUrl,
        streamExpiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[HomeRefresh] Resolution failed for "${track.artistName} - ${track.title}": ${message}`
      );
      return null;
    }
  });

  requests.set(key, request);
  void request.then((result) => {
    requests.delete(key);
    if (result?.streamExpiresAt) {
      cachedTracks.set(key, {
        value: result,
        expiresAt: result.streamExpiresAt,
      });
    }
  });
  return request;
};

export const refreshHomeTracks = async (
  tracks: HomeTrackSeed[],
  onTrackResolved?: (
    track: HomeTrackSeed,
    refreshed: RefreshedHomeTrack
  ) => void
): Promise<Record<string, RefreshedHomeTrack>> => {
  // Resolving every visible card starts several yt-dlp processes. On web that
  // starves the actual play/download request, so resolve only after a user
  // chooses a track.
  if (Platform.OS === 'web') return {};

  const unique = tracks.filter(
    (track, index) =>
      tracks.findIndex(
        (candidate) => canonicalKey(candidate) === canonicalKey(track)
      ) === index
  );
  const resolved = await Promise.all(
    unique.map(async (track) => {
      const refreshed = await resolveHomeTrack(track);
      if (refreshed) onTrackResolved?.(track, refreshed);
      return [track, refreshed] as const;
    })
  );
  const byCanonicalKey = new Map(
    resolved
      .filter((entry): entry is readonly [HomeTrackSeed, RefreshedHomeTrack] =>
        Boolean(entry[1])
      )
      .map(([track, refreshed]) => [canonicalKey(track), refreshed])
  );

  return tracks.reduce<Record<string, RefreshedHomeTrack>>(
    (result, track) => {
      const refreshed = byCanonicalKey.get(canonicalKey(track));
      return refreshed ? { ...result, [track.key]: refreshed } : result;
    },
    {}
  );
};
