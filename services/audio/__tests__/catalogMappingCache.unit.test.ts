import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCatalogMapping,
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
