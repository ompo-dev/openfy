import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCatalogMapping,
  hasUserDirectCatalogMapping,
  setCatalogMapping,
  invalidateCatalogMapping,
  _resetCatalogMappingCacheForTests,
} from '../catalogMappingCache';

describe('catalogMappingCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    _resetCatalogMappingCacheForTests();
  });

  it('stores and retrieves a mapping for a spotifyId', async () => {
    await setCatalogMapping('spotify_123', {
      videoId: 'aj5_Cvp9je0',
      confirmedAt: Date.now(),
      confidence: 95,
      source: 'youtube_search',
    });

    const mapping = await getCatalogMapping('spotify_123');
    expect(mapping).not.toBeNull();
    expect(mapping?.videoId).toBe('aj5_Cvp9je0');
    expect(mapping?.confidence).toBe(95);
  });

  it('rejects caching mappings below minimum confidence (90)', async () => {
    await setCatalogMapping('spotify_low', {
      videoId: 'low_conf_vid',
      confirmedAt: Date.now(),
      confidence: 75,
      source: 'youtube_search',
    });

    const mapping = await getCatalogMapping('spotify_low');
    expect(mapping).toBeNull();
  });

  it('persists across cache reset by reading from AsyncStorage', async () => {
    await setCatalogMapping('spotify_persist', {
      videoId: 'persist_vid',
      confirmedAt: Date.now(),
      confidence: 100,
      source: 'youtube_search',
    });

    // Reset in-memory cache
    _resetCatalogMappingCacheForTests();

    const mapping = await getCatalogMapping('spotify_persist');
    expect(mapping?.videoId).toBe('persist_vid');
  });

  it('retains manually chosen links across app restarts even after 30 days', async () => {
    await setCatalogMapping('spotify_manual', {
      videoId: 'abcdefghijk',
      confirmedAt: Date.now() - 45 * 24 * 60 * 60_000,
      confidence: 100,
      source: 'user_direct',
    });
    _resetCatalogMappingCacheForTests();
    expect((await getCatalogMapping('spotify_manual'))?.videoId).toBe('abcdefghijk');
    expect(hasUserDirectCatalogMapping('spotify_manual')).toBe(true);
  });

  it('invalidates a specific mapping', async () => {
    await setCatalogMapping('spotify_del', {
      videoId: 'to_delete',
      confirmedAt: Date.now(),
      confidence: 95,
      source: 'youtube_search',
    });

    await invalidateCatalogMapping('spotify_del');
    const mapping = await getCatalogMapping('spotify_del');
    expect(mapping).toBeNull();
  });
});
