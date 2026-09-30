import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserProfile } from '../recommendation/recommendationEngine';
import type { LibraryTrack } from '../library/catalogLibrary';
import type { LocalPlaylist } from '../library/localPlaylistManager';
import {
  getYouTubeMusicClient,
  getYouTubeMusicThumbnails,
  toYouTubeMusicArtistRouteId,
  type YouTubeMusicItem,
} from '../youtubeMusicClient';
import {
  groupLocalAlbums,
  groupLocalArtists,
  type LocalAlbumCollection,
} from '../library/localCollections';

export type PersonalizedHomeTrack = {
  id: string;
  spotifyId: string;
  title: string;
  artistName: string;
  albumName: string;
  imageURL: string;
  duration_ms: number;
  explicit?: boolean;
  artists?: { id: string; name: string }[];
  albumId?: string;
  albumArtists?: { id: string; name: string }[];
  trackNumber?: number;
  discNumber?: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  localAudioPath?: string;
  localImagePath?: string;
  streamUrl?: string;
  streamExpiresAt?: number;
  isDownloaded?: boolean;
};

export type RecommendationSeed = {
  id?: string;
  name: string;
  score: number;
  matchArtist?: boolean;
};

export type PersonalizedHomeArtist = {
  id: string;
  artistId: string;
  spotifyArtistId: string;
  title: string;
  imageURL: string;
  appearances: number;
};

export type PersonalizedHomeSnapshot = {
  albums: LocalAlbumCollection[];
  artists: PersonalizedHomeArtist[];
  continueListening: PersonalizedHomeTrack[];
  discoveries: PersonalizedHomeTrack[];
  discoveryTitle: string;
  featured: PersonalizedHomeTrack[];
  playlists: LocalPlaylist[];
  quickPicks: PersonalizedHomeTrack[];
  seeds: RecommendationSeed[];
  tracksById: Map<string, LibraryTrack>;
};

export const EMPTY_PERSONALIZED_HOME: PersonalizedHomeSnapshot = {
  albums: [],
  artists: [],
  continueListening: [],
  discoveries: [],
  discoveryTitle: 'Descobertas para você',
  featured: [],
  playlists: [],
  quickPicks: [],
  seeds: [],
  tracksById: new Map(),
};

const DISCOVERY_CACHE_KEY = 'openfy_home_discoveries_v3';
const DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DISCOVERY_REQUEST_TIMEOUT_MS = 9_000;

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const uniqueTracks = (tracks: PersonalizedHomeTrack[]) => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return tracks.filter((track) => {
    const id = track.spotifyId || `${normalize(track.artistName)}:${normalize(track.title)}`;
    const name = `${normalize(track.artists?.[0]?.name || track.artistName)}:${normalize(track.title)}`;
    if (seenIds.has(id) || seenNames.has(name)) return false;
    seenIds.add(id);
    seenNames.add(name);
    return true;
  });
};

const diverseTracks = (tracks: PersonalizedHomeTrack[], limit: number) => {
  const result: PersonalizedHomeTrack[] = [];
  const deferred: PersonalizedHomeTrack[] = [];
  const seenArtists = new Set<string>();

  uniqueTracks(tracks).forEach((track) => {
    const artist = normalize(track.artists?.[0]?.name || track.artistName);
    if (seenArtists.has(artist)) {
      deferred.push(track);
      return;
    }
    seenArtists.add(artist);
    result.push(track);
  });

  return [...result, ...deferred].slice(0, limit);
};

export const libraryTrackToHomeTrack = (
  track: LibraryTrack
): PersonalizedHomeTrack => ({
  id: track.id || `catalog_${track.spotifyId}`,
  spotifyId: track.spotifyId,
  title: track.title,
  artistName: track.artistName,
  albumName: track.albumName,
  imageURL: track.localImagePath || track.imageURL,
  duration_ms: track.duration_ms,
  artists: track.artists,
  albumId: track.albumId,
  albumArtists: track.albumArtists,
  trackNumber: track.trackNumber,
  discNumber: track.discNumber,
  youtubeVideoId: track.youtubeVideoId,
  youtubeUrl: track.youtubeUrl,
  localAudioPath: track.localAudioPath,
  localImagePath: track.localImagePath,
  streamUrl: track.audioUrl,
  isDownloaded: track.isDownloaded,
});

const canonicalToHomeTrack = (
  entry: UserProfile['recentlyPlayedTracks'][number]
): PersonalizedHomeTrack => ({
  id: `recent_${entry.track.spotifyId}`,
  spotifyId: entry.track.spotifyId,
  title: entry.track.title,
  artistName: entry.track.primaryArtist || entry.track.artists.join(', '),
  artists: entry.track.artists.map((name) => ({ id: '', name })),
  albumName: entry.track.albumName || 'Single',
  imageURL: entry.track.localImagePath || entry.track.imageURL || '',
  duration_ms: entry.track.durationMs || 0,
  localAudioPath: entry.track.localAudioPath,
  localImagePath: entry.track.localImagePath,
  isDownloaded: Boolean(entry.track.localAudioPath),
});

const trackArtistNames = (track: Pick<PersonalizedHomeTrack, 'artistName' | 'artists'>) =>
  [...new Set([
    track.artistName,
    ...(track.artists?.map((artist) => artist.name) || []),
  ].filter(Boolean))];

const affinityForTrack = (
  track: PersonalizedHomeTrack,
  artistWeights: Record<string, number>
) => {
  const weights = new Map(
    Object.entries(artistWeights).map(([artist, weight]) => [normalize(artist), weight])
  );
  return Math.max(
    0,
    ...trackArtistNames(track).map((artist) => weights.get(normalize(artist)) || 0)
  );
};

export const buildRecommendationSeeds = (
  tracks: LibraryTrack[],
  playlists: LocalPlaylist[],
  profile: UserProfile
): RecommendationSeed[] => {
  const playlistFrequency = new Map<string, number>();
  playlists.forEach((playlist) => {
    playlist.trackIds.forEach((id) =>
      playlistFrequency.set(id, (playlistFrequency.get(id) || 0) + 1)
    );
  });
  const seeds = new Map<string, RecommendationSeed>();
  const addSeed = (name: string, score: number, id?: string) => {
    const cleanName = name.trim();
    const key = normalize(cleanName);
    if (!key) return;
    const current = seeds.get(key);
    seeds.set(key, {
      id: current?.id || id,
      name: current?.name || cleanName,
      score: (current?.score || 0) + score,
    });
  };

  groupLocalArtists(tracks).forEach((artist) => {
    addSeed(
      artist.title,
      artist.tracks.length * 2 +
        artist.tracks.reduce(
          (sum, track) => sum + (playlistFrequency.get(track.spotifyId) || 0) * 3,
          0
        ),
      artist.spotifyArtistId
    );
  });
  Object.entries(profile.artistWeights).forEach(([name, weight]) =>
    addSeed(name, weight * 4)
  );
  profile.recentlyPlayedTracks.forEach((entry) => {
    entry.track.artists.forEach((artist) =>
      addSeed(artist, Math.max(1, entry.playCount) * 2)
    );
  });

  return [...seeds.values()]
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .slice(0, 5);
};

export const buildPersonalizedHome = ({
  allowExplicitRecommendations,
  discoveries = [],
  personalized,
  playlists,
  profile,
  seed = new Date().toISOString().slice(0, 10),
  tracks,
}: {
  allowExplicitRecommendations: boolean;
  discoveries?: PersonalizedHomeTrack[];
  personalized: boolean;
  playlists: LocalPlaylist[];
  profile: UserProfile;
  seed?: string;
  tracks: LibraryTrack[];
}): PersonalizedHomeSnapshot => {
  const tracksById = new Map(tracks.map((track) => [track.spotifyId, track]));
  const homeTracks = tracks.map(libraryTrackToHomeTrack);
  const recentEntries = [...profile.recentlyPlayedTracks].sort(
    (first, second) => second.lastPlayedAt - first.lastPlayedAt
  );
  const continueListening = uniqueTracks(
    recentEntries.map((entry) => {
      const saved = tracksById.get(entry.track.spotifyId);
      return saved ? libraryTrackToHomeTrack(saved) : canonicalToHomeTrack(entry);
    })
  ).slice(0, 10);
  const recentIds = new Set(continueListening.slice(0, 5).map((track) => track.spotifyId));
  const playlistFrequency = new Map<string, number>();
  playlists.forEach((playlist) => playlist.trackIds.forEach((id) =>
    playlistFrequency.set(id, (playlistFrequency.get(id) || 0) + 1)
  ));
  const playCounts = new Map(
    recentEntries.map((entry) => [entry.track.spotifyId, entry.playCount])
  );
  const rankedLibrary = [...homeTracks].sort((first, second) => {
    const score = (track: PersonalizedHomeTrack) =>
      (personalized
        ? affinityForTrack(track, profile.artistWeights) * 4 +
          (playlistFrequency.get(track.spotifyId) || 0) * 8 +
          (playCounts.get(track.spotifyId) || 0) * 2
        : 0) +
      (track.isDownloaded ? 2 : 0) -
      (recentIds.has(track.spotifyId) ? 12 : 0) +
      (stableHash(`${seed}:${track.spotifyId}`) % 1000) / 1000;
    return score(second) - score(first);
  });
  const libraryQuickPicks = diverseTracks(
    rankedLibrary.filter((track) => !recentIds.has(track.spotifyId)).length
      ? rankedLibrary.filter((track) => !recentIds.has(track.spotifyId))
      : rankedLibrary,
    12
  );
  const knownIds = new Set(homeTracks.map((track) => track.spotifyId));
  const knownNames = new Set(
    homeTracks.map(
      (track) =>
        `${normalize(track.artists?.[0]?.name || track.artistName)}:${normalize(track.title)}`
    )
  );
  const remoteDiscoveries = discoveries.filter(
    (track) =>
      !knownIds.has(track.spotifyId) &&
      !knownNames.has(
        `${normalize(track.artists?.[0]?.name || track.artistName)}:${normalize(track.title)}`
      ) &&
      (allowExplicitRecommendations || !track.explicit)
  );
  const quickPicks = diverseTracks(
    remoteDiscoveries.length ? remoteDiscoveries : libraryQuickPicks,
    12
  );
  const quickPickIds = new Set(quickPicks.map((track) => track.spotifyId));
  const remainingRemoteDiscoveries = remoteDiscoveries.filter(
    (track) => !quickPickIds.has(track.spotifyId)
  );
  const discoveryTracks = diverseTracks(
    remainingRemoteDiscoveries.length
      ? remainingRemoteDiscoveries
      : remoteDiscoveries.length
        ? remoteDiscoveries
      : rankedLibrary.filter((track) => !recentIds.has(track.spotifyId)),
    12
  );
  const albums = groupLocalAlbums(tracks)
    .sort((first, second) => {
      const score = (album: LocalAlbumCollection) =>
        album.tracks.reduce(
          (sum, track) =>
            sum + (playlistFrequency.get(track.spotifyId) || 0) * 2 +
            (playCounts.get(track.spotifyId) || 0),
          0
        );
      return score(second) - score(first) || second.tracks.length - first.tracks.length;
    })
    .slice(0, 10);
  const recommendationSeeds = personalized
    ? buildRecommendationSeeds(tracks, playlists, profile)
    : [];
  const knownArtistIds = new Set<string>();
  const knownArtistNames = new Set(
    recommendationSeeds.map((artist) => normalize(artist.name))
  );
  groupLocalArtists(tracks).forEach((artist) => {
    if (artist.spotifyArtistId) knownArtistIds.add(artist.spotifyArtistId);
    knownArtistNames.add(normalize(artist.title));
  });
  const artistCandidates = new Map<string, PersonalizedHomeArtist>();
  remoteDiscoveries.forEach((track) => {
    track.artists?.forEach((artist) => {
      const title = artist.name?.trim();
      const artistId = artist.id?.trim() ||
        `ytartist_name_${encodeURIComponent(title || '')}`;
      if (
        !title ||
        knownArtistIds.has(artistId) ||
        knownArtistNames.has(normalize(title))
      ) return;
      const current = artistCandidates.get(artistId);
      artistCandidates.set(artistId, {
        id: `recommended_artist_${artistId}`,
        artistId,
        spotifyArtistId: artistId,
        title,
        imageURL: current?.imageURL || track.imageURL,
        appearances: (current?.appearances || 0) + 1,
      });
    });
  });
  const artists = [...artistCandidates.values()]
    .sort((first, second) =>
      second.appearances - first.appearances ||
      (stableHash(`${seed}:${first.artistId}`) % 1000) -
        (stableHash(`${seed}:${second.artistId}`) % 1000)
    )
    .slice(0, 10);
  const orderedPlaylists = [...playlists]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, 10);
  const featured = (discoveryTracks.length ? discoveryTracks : quickPicks).slice(0, 5);

  return {
    albums,
    artists,
    continueListening,
    discoveries: discoveryTracks,
    discoveryTitle: remoteDiscoveries.length
      ? 'Descobertas para você'
      : 'Para você',
    featured,
    playlists: orderedPlaylists,
    quickPicks,
    seeds: recommendationSeeds,
    tracksById,
  };
};

type DiscoveryCache = {
  fetchedAt: number;
  seedKey: string;
  tracks: PersonalizedHomeTrack[];
};

const withDiscoveryTimeout = async <Value,>(promise: Promise<Value>): Promise<Value | null> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DISCOVERY_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const searchYouTubeMusic = async (
  seed: RecommendationSeed
): Promise<PersonalizedHomeTrack[]> => {
  try {
    const client = await withDiscoveryTimeout(getYouTubeMusicClient());
    if (!client) return [];
    const result = await withDiscoveryTimeout(
      client.music.search(seed.name, { type: 'song' })
    );
    const items = result?.songs?.contents || [];
    const artistNeedle = normalize(seed.name);
    return items
      .filter((item) => {
        if (seed.matchArtist === false) return true;
        const names = item.artists?.map((artist) => normalize(artist.name || '')) || [];
        return !names.length || names.some((name) =>
          name === artistNeedle || name.includes(artistNeedle) || artistNeedle.includes(name)
        );
      })
      .flatMap((item): PersonalizedHomeTrack[] => {
        const videoId = item.id || '';
        const title = item.title?.trim() || '';
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title) return [];
        const artists = item.artists?.flatMap((artist) => {
          const name = artist.name?.trim() || '';
          if (!name) return [];
          return [{
            id: toYouTubeMusicArtistRouteId(artist.channel_id, name),
            name,
          }];
        }) || [];
        const artistNames = artists.map((artist) => artist.name);
        if (!artistNames.length) artistNames.push(seed.name);
        const imageURL = [...(item.thumbnails || [])]
          .sort((first, second) => (second.width || 0) - (first.width || 0))[0]?.url || '';
        return [{
          id: `discovery_yt_${videoId}`,
          spotifyId: `yt_${videoId}`,
          title,
          artistName: artistNames.join(', '),
          artists: artists.length ? artists : [{ id: '', name: seed.name }],
          albumName: item.album?.name?.trim() || 'YouTube Music',
          imageURL,
          duration_ms: Math.max(0, item.duration?.seconds || 0) * 1000,
          youtubeVideoId: videoId,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        }];
      })
      .slice(0, 8);
  } catch {
    return [];
  }
};

const queueText = (value: YouTubeMusicItem['title'] | { toString(): string } | undefined): string => {
  if (typeof value === 'string') return value.trim();
  try {
    return value?.toString().trim() || '';
  } catch {
    return '';
  }
};

const queueItemToHomeTrack = (
  entry: YouTubeMusicItem,
  fallbackArtist: string
): PersonalizedHomeTrack | null => {
  const item = entry.primary || entry;
  if (item.selected) return null;
  const videoId = item.video_id || '';
  const title = queueText(item.title);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title) return null;
  const artists = (item.artists || [])
    .map((artist) => ({
      id: toYouTubeMusicArtistRouteId(artist.channel_id, artist.name?.trim() || ''),
      name: artist.name?.trim() || '',
    }))
    .filter((artist) => artist.name);
  const artistName = artists.map((artist) => artist.name).join(', ') || fallbackArtist;
  const imageURL = [...getYouTubeMusicThumbnails(item)]
    .sort((first, second) => (second.width || 0) - (first.width || 0))[0]?.url || '';
  return {
    id: `discovery_yt_${videoId}`,
    spotifyId: `yt_${videoId}`,
    title,
    artistName,
    artists: artists.length ? artists : [{ id: '', name: fallbackArtist }],
    albumName: item.album?.name?.trim() || 'YouTube Music',
    imageURL,
    duration_ms: Math.max(0, item.duration?.seconds || 0) * 1000,
    youtubeVideoId: videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
};

const loadYouTubeMusicRadio = async (
  seed: RecommendationSeed,
  anchorTracks: PersonalizedHomeTrack[]
): Promise<PersonalizedHomeTrack[]> => {
  const anchor = anchorTracks.find((track) => track.youtubeVideoId);
  if (!anchor?.youtubeVideoId) return [];
  try {
    const client = await withDiscoveryTimeout(getYouTubeMusicClient());
    if (!client) return [];
    const panel = await withDiscoveryTimeout(
      client.music.getUpNext(anchor.youtubeVideoId, true)
    );
    const tracks = (panel?.contents || [])
      .map((entry) => queueItemToHomeTrack(entry, seed.name))
      .filter((track): track is PersonalizedHomeTrack => Boolean(track));
    const seedName = normalize(seed.name);
    const newArtists = tracks.filter((track) =>
      !trackArtistNames(track).some((artist) => normalize(artist) === seedName)
    );
    const familiarArtists = tracks.filter((track) => !newArtists.includes(track));
    return diverseTracks([...newArtists, ...familiarArtists], 16);
  } catch {
    return [];
  }
};

export const loadHomeDiscoveries = async (
  seeds: RecommendationSeed[],
  knownTrackIds: Set<string>,
  allowExplicitRecommendations: boolean,
  forceRefresh = false
): Promise<PersonalizedHomeTrack[]> => {
  const activeSeeds = seeds.slice(0, 4);
  if (!activeSeeds.length) return [];
  const seedKey = activeSeeds
    .map((seed) => `${seed.matchArtist === false ? 'query' : 'artist'}:${seed.id || ''}:${normalize(seed.name)}`)
    .join('|');

  try {
    const raw = await AsyncStorage.getItem(DISCOVERY_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) as DiscoveryCache : null;
    if (
      !forceRefresh &&
      cached?.seedKey === seedKey &&
      Date.now() - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS
    ) {
      return cached.tracks.filter(
        (track) =>
          !knownTrackIds.has(track.spotifyId) &&
          (allowExplicitRecommendations || !track.explicit)
      );
    }
  } catch {}

  const groups = await Promise.all(
    activeSeeds.map(async (seed) => {
      const anchors = await searchYouTubeMusic(seed);
      const radio = await loadYouTubeMusicRadio(seed, anchors);
      return [...radio, ...anchors];
    })
  );
  const tracks = uniqueTracks(groups.flat());
  if (tracks.length) {
    await AsyncStorage.setItem(
      DISCOVERY_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), seedKey, tracks } satisfies DiscoveryCache)
    ).catch(() => {});
  }

  return tracks.filter(
    (track) =>
      !knownTrackIds.has(track.spotifyId) &&
      (allowExplicitRecommendations || !track.explicit)
  );
};

export const clearHomeDiscoveryCache = () =>
  AsyncStorage.removeItem(DISCOVERY_CACHE_KEY);
