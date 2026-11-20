import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { loadYouTubeMusicRadio, type PersonalizedHomeTrack, type RecommendationSeed } from './personalizedHome';
import { log } from '../../utils/appLogger';
import { preferUnseenHomeTracks } from './homeVariation';

const radioCache = createAsyncResourceCache<PersonalizedHomeTrack[]>({
  name: 'home artist radio', category: 'home', maxEntries: 8,
  shouldCache: (tracks) => tracks.length > 0,
});

export const loadHomeRadio = (seed: RecommendationSeed, anchors: PersonalizedHomeTrack[], force = false, variation = 0) => {
  const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  const key = JSON.stringify([seed.id || '', normalize(seed.name)]);
  return radioCache.getOrLoad(force ? `${key}:refresh:${variation}` : key, async () => {
    const previous = radioCache.peek(key) || [];
    const candidates = await loadYouTubeMusicRadio(seed, anchors, variation);
    const tracks = force ? preferUnseenHomeTracks(candidates, new Set(previous.map((track) => track.spotifyId))) : candidates;
    if (force && tracks.length) radioCache.set(key, tracks, 6 * 60 * 60_000);
    log.home('artist radio renewed', { artist: seed.name, force, variation, tracks: tracks.length });
    return tracks;
  }, force ? 0 : 6 * 60 * 60_000);
};
