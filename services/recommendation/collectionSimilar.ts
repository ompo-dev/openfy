import type { TrackModel } from '../../models';
import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { getTrackYouTubeVideoId } from '../spotify/linkParser';
import { getCachedAppSettings } from '../settings/appSettings';
import { yieldToPlaybackStartup } from '../network/audioPriority';
import { loadHomeDiscoveries, loadYouTubeMusicRadio, type PersonalizedHomeTrack } from '../home/personalizedHome';
import { log } from '../../utils/appLogger';

const relatedCache = createAsyncResourceCache<TrackModel[]>({
  name: 'collection related tracks', category: 'playlist', maxEntries: 30,
  shouldCache: (tracks) => tracks.length > 0,
});

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toLocaleLowerCase();
const identity = (title: string, artist: string) => `${normalize(artist)}:${normalize(title)}`;

/** Related to actual members of this collection, not the user's top artist. */
export const loadCollectionSimilarTracks = (collectionId: string, tracks: TrackModel[]): Promise<TrackModel[]> => {
  const members = tracks.filter((track) => track.title && track.subtitle);
  if (!members.length) return Promise.resolve([]);
  const key = JSON.stringify([collectionId, members.slice(0, 8).map((track) =>
    [track.id, getTrackYouTubeVideoId(track)])]);
  return relatedCache.getOrLoad(key, async () => {
    await yieldToPlaybackStartup();
    const knownIds = new Set(members.map((track) => track.id));
    const knownNames = new Set(members.map((track) => identity(track.title, track.artists?.[0]?.name || track.subtitle)));
    const valid = members.filter((track) => getTrackYouTubeVideoId(track));
    const samples = valid.length <= 3 ? valid : [valid[0], valid[Math.floor(valid.length / 2)], valid[valid.length - 1]];
    const radios = await Promise.all(samples.map(async (track) => {
      const videoId = getTrackYouTubeVideoId(track)!;
      const artistName = track.artists?.[0]?.name || track.subtitle.split(',')[0];
      const anchor: PersonalizedHomeTrack = {
        id: track.id, spotifyId: track.id, title: track.title, artistName,
        albumName: track.albumName || '', imageURL: track.imageURL || '',
        duration_ms: track.durationMs || 0, artists: track.artists,
        youtubeVideoId: videoId,
      };
      return loadYouTubeMusicRadio({ name: artistName, score: 1 }, [anchor]);
    }));
    let candidates = radios.flat();
    if (!candidates.length) {
      const seeds = [...new Set(members.map((track) => track.artists?.[0]?.name || track.subtitle.split(',')[0]))]
        .filter(Boolean).slice(0, 3).map((name) => ({ name, score: 1 }));
      candidates = await loadHomeDiscoveries(seeds, knownIds, getCachedAppSettings().allowExplicitRecommendations);
    }
    const seen = new Set<string>();
    const distinct = new Set<string>();
    const result: TrackModel[] = [];
    const deferred: TrackModel[] = [];
    candidates.forEach((candidate) => {
      const artist = candidate.artists?.[0]?.name || candidate.artistName;
      const nameKey = identity(candidate.title, artist);
      if (knownIds.has(candidate.spotifyId) || knownNames.has(nameKey) || seen.has(nameKey) ||
          (!getCachedAppSettings().allowExplicitRecommendations && candidate.explicit)) return;
      seen.add(nameKey);
      const transformed = {
        id: candidate.spotifyId, title: candidate.title, subtitle: candidate.artistName,
        artists: candidate.artists, albumName: candidate.albumName,
        imageURL: candidate.imageURL, durationMs: candidate.duration_ms,
        youtubeVideoId: candidate.youtubeVideoId, youtubeUrl: candidate.youtubeUrl,
      } as TrackModel;
      (distinct.has(normalize(artist)) ? deferred : result).push(transformed);
      distinct.add(normalize(artist));
    });
    const related = [...result, ...deferred].slice(0, 16);
    log.playlist('contextual similar tracks', { collectionId, anchors: samples.length,
      candidates: candidates.length, recommended: related.length });
    return related;
  }, 15 * 60_000);
};
