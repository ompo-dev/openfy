import { fetchSpotifyTrackMetadata } from '../metadata/spotifyMetadata';

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

const HOME_METADATA_TTL_MS = 30 * 60_000;
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
      // Home only hydrates catalog metadata. Audio is resolved on demand by
      // PlayerStore after a user explicitly chooses a track.
      const metadata = await fetchSpotifyTrackMetadata(track.spotifyId);
      if (!metadata) {
        console.warn(
          `[HomeRefresh] No public metadata for "${track.artistName} - ${track.title}".`
        );
        return null;
      }

      return {
        spotifyId: track.spotifyId,
        title: metadata.title || track.title,
        artistName: metadata.artistName || track.artistName,
        albumName: metadata.albumName || track.albumName,
        imageURL: metadata.imageURL || track.imageURL,
        duration_ms: metadata.duration_ms || track.duration_ms,
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
    if (result) {
      cachedTracks.set(key, {
        value: result,
        expiresAt: Date.now() + HOME_METADATA_TTL_MS,
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
