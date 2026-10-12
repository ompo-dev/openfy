import { createAsyncResourceCache } from '../../src/application/asyncResourceCache';
import { log } from '../../utils/appLogger';

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

/** Only Expo's disposable image cache; downloaded library files remain untouched. */
export const clearImageCache = async (): Promise<void> => {
  const finish = log.time('network', 'image cache clear');
  images.clear();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('expo-image') as typeof import('expo-image');
    const results = await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
    if (results.some((result) => !result)) throw new Error('Nao foi possivel limpar o cache de imagens.');
    finish({ ok: true });
  } catch (error) { finish({ ok: false, error: String(error) }); throw error; }
  finally { images.clear(); }
};

export const _clearImagePrefetchForTests = () => images.clear();
