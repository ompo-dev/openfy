jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(), clearMemoryCache: jest.fn(), clearDiskCache: jest.fn() } }));
import { Image } from 'expo-image';
import { _clearImagePrefetchForTests, clearImageCache, prefetchImage, prefetchImages } from '../imagePrefetch';

const flush = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe('image bytes prefetch', () => {
  beforeEach(() => {
    _clearImagePrefetchForTests();
    jest.mocked(Image.prefetch).mockReset().mockResolvedValue(true);
    jest.mocked(Image.clearMemoryCache).mockReset().mockResolvedValue(true);
    jest.mocked(Image.clearDiskCache).mockReset().mockResolvedValue(true);
  });

  it('coalesces repeated artwork and uses the same cache policy as the UI', async () => {
    await prefetchImages(['https://img.test/album.jpg', 'https://img.test/album.jpg']);
    await prefetchImage('https://img.test/album.jpg');
    expect(Image.prefetch).toHaveBeenCalledTimes(1);
    expect(Image.prefetch).toHaveBeenCalledWith('https://img.test/album.jpg', { cachePolicy: 'memory-disk' });
  });

  it('clears both disposable caches and invalidates prefetch records, not local library paths', async () => {
    await prefetchImage('https://img.test/cover.jpg');
    await clearImageCache();
    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
    await prefetchImage('https://img.test/cover.jpg');
    expect(Image.prefetch).toHaveBeenCalledTimes(2);
    await prefetchImage('file:///library/cover.jpg');
    expect(Image.prefetch).toHaveBeenCalledTimes(2);
  });

  it('does not report success when the platform cannot clear its cache', async () => {
    jest.mocked(Image.clearDiskCache).mockResolvedValue(false);
    await expect(clearImageCache()).rejects.toThrow('Nao foi possivel limpar');
  });

  it('does not fetch local files or empty images', async () => {
    await prefetchImages(['', 'file:///cover.jpg']);
    expect(Image.prefetch).not.toHaveBeenCalled();
  });

  it('bounds simultaneous downloads even across unrelated callers', async () => {
    const finishes: (() => void)[] = [];
    jest.mocked(Image.prefetch).mockImplementation(() => new Promise<boolean>((resolve) => finishes.push(() => resolve(true))));
    const requests = Array.from({ length: 7 }, (_, index) => prefetchImage(`https://img.test/${index}.jpg`));
    await flush();
    expect(Image.prefetch).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 7; index += 1) {
      finishes[index]();
      await flush();
      expect(Image.prefetch).toHaveBeenCalledTimes(Math.min(7, index + 4));
    }
    await Promise.all(requests);
  });

  it('absorbs failures and retries them after a short TTL', async () => {
    let now = 0;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      jest.mocked(Image.prefetch).mockRejectedValueOnce(new Error('offline'));
      await expect(prefetchImage('https://img.test/retry.jpg')).resolves.toBe(false);
      await expect(prefetchImage('https://img.test/retry.jpg')).resolves.toBe(false);
      expect(Image.prefetch).toHaveBeenCalledTimes(1);
      now = 10001;
      await expect(prefetchImage('https://img.test/retry.jpg')).resolves.toBe(true);
      expect(Image.prefetch).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });
});
