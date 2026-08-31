const mockCreate = jest.fn();

jest.mock('youtubei.js', () => ({ Innertube: { create: mockCreate } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseYouTubeVideoId,
  resolveSpotifyTrackVideoId,
  _resetCatalogResolverForTests,
} from '../catalogResolver';
import {
  getCatalogMapping,
  setCatalogMapping,
  _resetCatalogMappingCacheForTests,
} from '../catalogMappingCache';

describe('parseYouTubeVideoId', () => {
  it('parses bare 11-char videoId', () => {
    expect(parseYouTubeVideoId('aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
    expect(parseYouTubeVideoId('V1M1hYxmRvA')).toBe('V1M1hYxmRvA');
  });

  it('parses yt_ prefix internal format', () => {
    expect(parseYouTubeVideoId('yt_aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
  });

  it('parses standard youtube.com watch URLs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
    expect(parseYouTubeVideoId('https://youtube.com/watch?v=aj5_Cvp9je0&t=42')).toBe('aj5_Cvp9je0');
  });

  it('parses music.youtube.com URLs', () => {
    expect(parseYouTubeVideoId('https://music.youtube.com/watch?v=aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
  });

  it('parses youtu.be short URLs', () => {
    expect(parseYouTubeVideoId('https://youtu.be/aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
  });

  it('parses embed and shorts URLs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/aj5_Cvp9je0')).toBe('aj5_Cvp9je0');
  });

  it('returns null for invalid strings', () => {
    expect(parseYouTubeVideoId('')).toBeNull();
    expect(parseYouTubeVideoId('invalid_id')).toBeNull();
    expect(parseYouTubeVideoId('https://open.spotify.com/track/123')).toBeNull();
  });
});

describe('resolveSpotifyTrackVideoId', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCreate.mockReset();
    _resetCatalogResolverForTests();
    _resetCatalogMappingCacheForTests();
  });

  it('uses cached mapping if available without searching', async () => {
    const search = jest.fn();
    mockCreate.mockResolvedValue({ search });

    // Seed cache
    await setCatalogMapping('spotify_cached_123', {
      videoId: 'cached_vid_99',
      confirmedAt: Date.now(),
      confidence: 100,
      source: 'youtube_search',
    });

    const result = await resolveSpotifyTrackVideoId(
      'spotify_cached_123',
      'Minha Gang',
      ['Micael Rapper', 'ÉoDan'],
      180_000
    );

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.videoId).toBe('cached_vid_99');
    expect(search).not.toHaveBeenCalled();
  });

  it('searches, matches, and persists catalog mapping on match', async () => {
    const search = jest.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'aj5_Cvp9je0',
          title: { toString: () => 'Minha Gang' },
          author: { name: 'Micael' },
          duration: { seconds: 180 },
          best_thumbnail: { url: 'https://img.youtube.test/thumb.jpg' },
        },
      ],
    });
    mockCreate.mockResolvedValue({ search });

    const result = await resolveSpotifyTrackVideoId(
      'spotify_gang_789',
      'Minha Gang',
      ['Micael Rapper', 'ÉoDan'],
      180_000
    );

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.videoId).toBe('aj5_Cvp9je0');

    // Verify it was persisted to catalogMappingCache
    const cached = await getCatalogMapping('spotify_gang_789');
    expect(cached?.videoId).toBe('aj5_Cvp9je0');
    expect(cached?.confidence).toBeGreaterThanOrEqual(90);
  });

  it('returns not_found when no candidate matches', async () => {
    const search = jest.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'unrelated_vid',
          title: { toString: () => 'Totally Different Song' },
          author: { name: 'Different Artist' },
          duration: { seconds: 60 },
        },
      ],
    });
    mockCreate.mockResolvedValue({ search });

    const result = await resolveSpotifyTrackVideoId(
      'spotify_unmatched',
      'Minha Gang',
      ['Micael Rapper'],
      180_000
    );

    expect(result.status).toBe('not_found');
  });
});
