import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';

const images = createAsyncResourceCache<boolean>({
  name: 'image bytes', maxEntries: 250,
  ttlFor: (loaded) => loaded ? 6 * 60 * 60_000 : 10_000,
});
let activeLoads = 0;
const waiting: (() => void)[] = [];

const loadImageBytes = async (url: string): Promise<boolean> => {
  if (activeLoads >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else activeLoads += 1;
  try {
    // Keep Expo's native image module out of the playback store's startup path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('expo-image') as typeof import('expo-image');
    return await Image.prefetch(url, { cachePolicy: 'memory-disk' });
  } catch {
    return false;
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeLoads -= 1;
  }
};

export const prefetchImage = (url: string): Promise<boolean> => {
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(false);
  return images.getOrLoad(url, () => loadImageBytes(url), 6 * 60 * 60_000);
};

export const prefetchImages = async (urls: string[]): Promise<void> => {
  const unique = [...new Set(urls.filter(Boolean))];
  await Promise.all(unique.map(prefetchImage));
};

export const _clearImagePrefetchForTests = () => images.clear();
