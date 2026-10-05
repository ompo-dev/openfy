import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { loadYouTubeMusicRadio, type PersonalizedHomeTrack, type RecommendationSeed } from './personalizedHome';

const radioCache = createAsyncResourceCache<PersonalizedHomeTrack[]>({
  name: 'home artist radio', category: 'home', maxEntries: 8,
  shouldCache: (tracks) => tracks.length > 0,
});

export const loadHomeRadio = (seed: RecommendationSeed, anchors: PersonalizedHomeTrack[]) => {
  const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  const key = normalize(seed.name);
  return radioCache.getOrLoad(key, () => loadYouTubeMusicRadio(seed, anchors), 6 * 60 * 60_000);
};
