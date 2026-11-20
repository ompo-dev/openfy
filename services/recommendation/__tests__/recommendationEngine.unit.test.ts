import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearUserProfile, getUserProfile, recordInteraction } from '../recommendationEngine';

const track = {
  spotifyId: 'yt_abcdefghijk', title: 'Gravação correta', artistName: 'Artista',
  artists: [{ id: 'artist', name: 'Artista' }], albumName: 'Álbum', duration_ms: 180_000,
};

describe('recommendation preference signals', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearUserProfile();
  });

  it('does not invent listens or recent songs from likes, skips and saves', async () => {
    await recordInteraction(track, 'like');
    await recordInteraction(track, 'save');
    await recordInteraction(track, 'skip');
    const profile = await getUserProfile();
    expect(profile.totalListens).toBe(0);
    expect(profile.recentlyPlayedTracks).toEqual([]);
    expect(profile.artistWeights.Artista).toBe(16);
    expect(profile.trackFeedback?.[track.spotifyId].skips).toBe(1);
  });

  it('serializes simultaneous playback signals without losing listens', async () => {
    await Promise.all(Array.from({ length: 15 }, () => recordInteraction(track, 'play')));
    const profile = await getUserProfile();
    expect(profile.totalListens).toBe(15);
    expect(profile.recentlyPlayedTracks).toHaveLength(1);
    expect(profile.recentlyPlayedTracks[0].playCount).toBe(15);
  });

  it('records completion separately from listening count and keeps negative feedback', async () => {
    await recordInteraction(track, 'play');
    await recordInteraction(track, 'complete');
    await recordInteraction(track, 'dislike');
    const profile = await getUserProfile();
    expect(profile.totalListens).toBe(1);
    expect(profile.trackFeedback?.[track.spotifyId].completes).toBe(1);
    expect(profile.artistWeights.Artista).toBe(-9);
    expect(profile.trackFeedback?.[track.spotifyId].dislikes).toBe(1);
  });
});
