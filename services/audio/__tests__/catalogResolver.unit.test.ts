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
      policyVersion: 2,
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

  it('compares later results and channel subscribers before selecting the publisher', async () => {
    const makeVideo = (id: string, artist: string, official: boolean, channelId: string) => ({
      video_id: id, title: { toString: () => 'Pedro Qualy & Sotam - Taros' },
      author: { name: artist, is_verified_artist: official, id: channelId },
      duration: { seconds: 270 }, view_count: { toString: () => official ? '486,390 views' : '120 views' },
    });
    const channelId = 'UCqhmlFknRAuBvT1grx1jZPw';
    const search = jest.fn().mockResolvedValueOnce({ videos: [makeVideo('aaaaaaaaaaa', 'Pedro Qualy', false, 'UCaaaaaaaaaaaaaaaaaaaaaa')] })
      .mockResolvedValue({ videos: [makeVideo('LIXckjwbPdY', 'HAIKAISS OFICIAL', true, channelId)] });
    const getChannel = jest.fn(async (id: string) => ({ metadata: { external_id: id },
      header: { content: { metadata: { metadata_rows: [{ metadata_parts: [{ text: {
        toString: () => id === channelId ? '3.43M subscribers' : '40 subscribers',
      } }] }] } } } }));
    mockCreate.mockResolvedValue({ search, getChannel });
    await setCatalogMapping('taros', { videoId: 'aaaaaaaaaaa', confirmedAt: Date.now(), confidence: 100, source: 'youtube_search' });
    expect(await resolveSpotifyTrackVideoId('taros', 'Taros', ['Pedro Qualy', 'Sotam'], 269785))
      .toMatchObject({ status: 'resolved', videoId: 'LIXckjwbPdY' });
    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(getChannel).toHaveBeenCalledWith(channelId);
    expect(await getCatalogMapping('taros')).toMatchObject({ videoId: 'LIXckjwbPdY', policyVersion: 2 });
  });

  it('keeps explicit user choices even when automatic matching policy changes', async () => {
    await setCatalogMapping('manual', { videoId: 'aaaaaaaaaaa', confirmedAt: Date.now(), confidence: 100, source: 'user_direct' });
    expect(await resolveSpotifyTrackVideoId('manual', 'Taros', ['Pedro Qualy'], 269785))
      .toMatchObject({ videoId: 'aaaaaaaaaaa' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('still selects a matching source when channel counts are unavailable', async () => {
    mockCreate.mockResolvedValue({ search: jest.fn().mockResolvedValue({ videos: [{
      video_id: 'LIXckjwbPdY', title: { toString: () => 'Pedro Qualy & Sotam - Taros' },
      author: { name: 'HAIKAISS OFICIAL', is_verified_artist: true, id: 'UCqhmlFknRAuBvT1grx1jZPw' },
      duration: { seconds: 270 },
    }] }), getChannel: jest.fn().mockRejectedValue(new Error('unavailable')) });
    expect(await resolveSpotifyTrackVideoId('taros-offline-channel', 'Taros', ['Pedro Qualy', 'Sotam'], 269785))
      .toMatchObject({ status: 'resolved', videoId: 'LIXckjwbPdY' });
  });
});
