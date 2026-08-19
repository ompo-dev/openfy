/**
 * Openfy Recommendation Engine V1
 *
 * An independent, privacy-first, on-device recommendation and scoring system.
 * Does NOT rely on Spotify recommendations or black-box third-party algorithms.
 *
 * Scoring Weights:
 * - like: +10
 * - save: +12
 * - complete (>= 80% played): +5
 * - repeat: +8
 * - play: +1
 * - skip (< 30s played): -6
 * - dislike: -15
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CanonicalTrack } from '../../models/CanonicalTrack';
import { resolveAudioUrl, ResolvedAudio } from '../audio/audioResolver';

export type InteractionType =
  | 'play'
  | 'complete'
  | 'like'
  | 'save'
  | 'repeat'
  | 'skip'
  | 'dislike';

export type UserInteraction = {
  trackId: string;
  title: string;
  artistName: string;
  genre?: string;
  interaction: InteractionType;
  timestamp: number;
};

export type UserProfile = {
  artistWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  recentlyPlayedTracks: {
    track: CanonicalTrack;
    lastPlayedAt: number;
    playCount: number;
  }[];
  totalListens: number;
};

const USER_PROFILE_KEY = 'openfy_user_profile';
const STREAM_CACHE = new Map<string, { resolved: ResolvedAudio; expiresAt: number }>();

const INTERACTION_WEIGHTS: Record<InteractionType, number> = {
  like: 10,
  save: 12,
  complete: 5,
  repeat: 8,
  play: 1,
  skip: -6,
  dislike: -15,
};

/**
 * Load or initialize user profile
 */
export const getUserProfile = async (): Promise<UserProfile> => {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    if (!raw) {
      return {
        artistWeights: {},
        genreWeights: {},
        recentlyPlayedTracks: [],
        totalListens: 0,
      };
    }
    return JSON.parse(raw) as UserProfile;
  } catch {
    return {
      artistWeights: {},
      genreWeights: {},
      recentlyPlayedTracks: [],
      totalListens: 0,
    };
  }
};

/**
 * Save user profile to storage
 */
const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
};

/**
 * Record a user interaction signal and update affinity profile in real-time
 */
export const recordInteraction = async (
  track: {
    spotifyId: string;
    title: string;
    artistName: string;
    albumName?: string;
    imageURL?: string;
    duration_ms?: number;
  },
  interaction: InteractionType
): Promise<void> => {
  try {
    const profile = await getUserProfile();
    const weight = INTERACTION_WEIGHTS[interaction] || 1;
    const artist = track.artistName || 'Unknown';

    // Update Artist Weight
    profile.artistWeights[artist] = (profile.artistWeights[artist] || 0) + weight;

    // Update Recently Played
    const existingIndex = profile.recentlyPlayedTracks.findIndex(
      (r) => r.track.spotifyId === track.spotifyId
    );

    const canonical: CanonicalTrack = {
      id: track.spotifyId,
      spotifyId: track.spotifyId,
      title: track.title,
      artists: [track.artistName],
      primaryArtist: track.artistName,
      albumName: track.albumName || 'Spotify',
      durationMs: track.duration_ms || 0,
      imageURL: track.imageURL || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      profile.recentlyPlayedTracks[existingIndex].lastPlayedAt = Date.now();
      if (interaction === 'play') {
        profile.recentlyPlayedTracks[existingIndex].playCount += 1;
      }
    } else {
      profile.recentlyPlayedTracks.unshift({
        track: canonical,
        lastPlayedAt: Date.now(),
        playCount: 1,
      });
    }

    // Keep top 30 recently played
    if (profile.recentlyPlayedTracks.length > 30) {
      profile.recentlyPlayedTracks = profile.recentlyPlayedTracks.slice(0, 30);
    }

    profile.totalListens += 1;
    await saveUserProfile(profile);
  } catch (err) {
    console.warn('[RecommendationEngine] recordInteraction error:', err);
  }
};

/**
 * Stream Pre-Warm & In-Memory Stream Cache
 * Pre-resolves audio stream for upcoming items so playback starts with 0ms lag.
 */
export const preWarmStream = async (track: {
  title: string;
  artistName: string;
  spotifyId?: string;
  duration_ms?: number;
}): Promise<ResolvedAudio | null> => {
  const cacheKey = track.spotifyId || `${track.artistName}_${track.title}`;
  const cached = STREAM_CACHE.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.resolved;
  }

  try {
    const resolved = await resolveAudioUrl(
      track.title,
      track.artistName,
      track.spotifyId,
      track.duration_ms
    );

    if (resolved) {
      // Cache stream URL for 15 minutes
      STREAM_CACHE.set(cacheKey, {
        resolved,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      return resolved;
    }
  } catch {}

  return null;
};

/**
 * Get Top Affinity Artist
 */
export const getTopAffinityArtist = async (): Promise<string | null> => {
  const profile = await getUserProfile();
  const entries = Object.entries(profile.artistWeights);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
};

/**
 * Get Continue Listening Section
 */
export const getContinueListening = async (): Promise<CanonicalTrack[]> => {
  const profile = await getUserProfile();
  return profile.recentlyPlayedTracks.map((r) => r.track).slice(0, 10);
};

/**
 * Get Explainable Recommendation Mixes
 */
export const getExplainableRecommendations = async (): Promise<{
  sectionTitle: string;
  reason: string;
  tracks: CanonicalTrack[];
}> => {
  const profile = await getUserProfile();
  const topArtist = await getTopAffinityArtist();

  const tracks = profile.recentlyPlayedTracks.map((r) => r.track);

  if (topArtist) {
    return {
      sectionTitle: `Porque você ouviu ${topArtist}`,
      reason: 'Baseado no seu artista mais tocado recentemente',
      tracks: tracks.filter((t) => t.primaryArtist === topArtist).slice(0, 8),
    };
  }

  return {
    sectionTitle: 'Feito Para Você',
    reason: 'Músicas e artistas em alta na sua vibe',
    tracks: tracks.slice(0, 8),
  };
};
