import { MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout } from '@utils';

import { getPlayableAudioUrl } from '../audio/audioResolver';
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

type ResolveResponse = {
  source?: { streamUrl?: string; id?: string };
  track?: {
    title?: string;
    artistName?: string;
    albumName?: string;
    imageURL?: string;
    duration_ms?: number;
  };
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
    if (!MUSIC_SERVER_URL) return null;

    try {
      const response = await fetchWithTimeout(
        `${MUSIC_SERVER_URL}/api/music/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: track.title,
            artist: track.artistName,
            durationMs: track.duration_ms,
            includeLyrics: false,
          }),
        },
        15_000
      );
      if (!response.ok) return null;

      const data = (await response.json()) as ResolveResponse;
      if (!data.source?.streamUrl) return null;

      const streamExpiresAt = Date.now() + HOME_STREAM_TTL_MS;
      const streamUrl = getPlayableAudioUrl(data.source.streamUrl, data.source.id);
      void preloadAudio(streamUrl);
      return {
        spotifyId: track.spotifyId,
        title: data.track?.title || track.title,
        artistName: data.track?.artistName || track.artistName,
        albumName: data.track?.albumName || track.albumName,
        imageURL: data.track?.imageURL || track.imageURL,
        duration_ms: data.track?.duration_ms || track.duration_ms,
        streamUrl,
        streamExpiresAt,
      };
    } catch {
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
