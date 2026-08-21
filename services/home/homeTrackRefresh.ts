import { MUSIC_SERVER_URL } from '@config';
import { fetchWithTimeout } from '@utils';

import { getPlayableAudioUrl } from '../audio/audioResolver';

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
};

type ResolveResponse = {
  source?: { streamUrl?: string };
  track?: {
    title?: string;
    artistName?: string;
    albumName?: string;
    imageURL?: string;
    duration_ms?: number;
  };
};

const requests = new Map<string, Promise<RefreshedHomeTrack | null>>();

const canonicalKey = (track: HomeTrackSeed) =>
  `${track.title}\u0000${track.artistName}\u0000${track.duration_ms}`.toLowerCase();

const resolveHomeTrack = (track: HomeTrackSeed) => {
  const key = canonicalKey(track);
  const active = requests.get(key);
  if (active) return active;

  const request = (async (): Promise<RefreshedHomeTrack | null> => {
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

      return {
        spotifyId: track.spotifyId,
        title: data.track?.title || track.title,
        artistName: data.track?.artistName || track.artistName,
        albumName: data.track?.albumName || track.albumName,
        imageURL: data.track?.imageURL || track.imageURL,
        duration_ms: data.track?.duration_ms || track.duration_ms,
        streamUrl: getPlayableAudioUrl(data.source.streamUrl),
      };
    } catch {
      return null;
    }
  })();

  requests.set(key, request);
  void request.then((result) => {
    if (!result) requests.delete(key);
  });
  return request;
};

export const refreshHomeTracks = async (
  tracks: HomeTrackSeed[]
): Promise<Record<string, RefreshedHomeTrack>> => {
  const unique = tracks.filter(
    (track, index) =>
      tracks.findIndex(
        (candidate) => canonicalKey(candidate) === canonicalKey(track)
      ) === index
  );
  const resolved: (readonly [HomeTrackSeed, RefreshedHomeTrack | null])[] = [];
  for (let index = 0; index < unique.length; index += 3) {
    const batch = unique.slice(index, index + 3);
    const batchResults = await Promise.all(
      batch.map(async (track) => [track, await resolveHomeTrack(track)] as const)
    );
    resolved.push(...batchResults);
  }
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
