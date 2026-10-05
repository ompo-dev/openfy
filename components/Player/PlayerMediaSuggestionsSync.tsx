import * as React from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useShallow } from 'zustand/react/shallow';
import { useAppSettings } from '@context';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { getUserProfile } from '../../services/recommendation/recommendationEngine';
import { buildPersonalizedHome } from '../../services/home/personalizedHome';
import { loadHomeRadio } from '../../services/home/homeRadio';
import { buildMediaSuggestions, parseSuggestedMediaTrack, toSuggestedMediaEntry, type SuggestedMediaEntry } from '../../services/home/mediaSuggestions';
import { log } from '../../utils/appLogger';

type MediaBridge = {
  setSuggestedMediaAsync?: (entries: SuggestedMediaEntry[]) => Promise<void>;
  donatePlayedMediaAsync?: (entry: SuggestedMediaEntry) => Promise<void>;
  getPendingSuggestedMediaAsync?: () => Promise<{ requestId: string; trackJSON: string } | null>;
  acknowledgeSuggestedMediaAsync?: (id: string, success: boolean) => Promise<void>;
  addListener?: (name: string, listener: () => void) => { remove: () => void };
};

export function PlayerMediaSuggestionsSync() {
  const bridge = React.useMemo(() => Platform.OS === 'ios' ? requireOptionalNativeModule<MediaBridge>('OpenfyYouTube') : null, []);
  const { settings } = useAppSettings();
  const { currentTrack, isPlaying, queue, queueIndex } = usePlayerStore(useShallow((state) => ({
    currentTrack: state.currentTrack, isPlaying: state.playerState.isPlaying,
    queue: state.queue, queueIndex: state.queueIndex,
  })));
  const donated = React.useRef('');
  React.useEffect(() => {
    if (!bridge?.getPendingSuggestedMediaAsync) return;
    const inFlight = new Set<string>();
    const receive = async () => {
      const request = await bridge.getPendingSuggestedMediaAsync?.();
      if (!request || inFlight.has(request.requestId)) return;
      inFlight.add(request.requestId);
      let success = false;
      try {
        const track = parseSuggestedMediaTrack(request.trackJSON);
        if (track) {
          await usePlayerStore.getState().playTrack(track);
          const state = usePlayerStore.getState();
          success = state.currentTrack?.spotifyId === track.spotifyId && state.playerState.isPlaying && !state.playerState.error;
        }
      } finally {
        await bridge.acknowledgeSuggestedMediaAsync?.(request.requestId, success);
        inFlight.delete(request.requestId);
      }
    };
    const handle = () => { void receive().catch((error) => log.error('suggested media playback failed', { error: String(error) })); };
    const subscription = bridge.addListener?.('onSuggestedMediaPlayback', handle);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') handle(); });
    handle();
    return () => { subscription?.remove(); appState.remove(); };
  }, [bridge]);

  React.useEffect(() => {
    if (!bridge?.setSuggestedMediaAsync) return;
    if (!currentTrack) {
      void bridge.setSuggestedMediaAsync([]).catch(() => {});
      return;
    }
    // Prepare suggestions while playing too, before iOS can suspend JS after a pause.
    let active = true;
    if (isPlaying) {
      if (donated.current !== currentTrack.spotifyId) {
        donated.current = currentTrack.spotifyId;
        void bridge.donatePlayedMediaAsync?.(toSuggestedMediaEntry(currentTrack)).catch(() => {});
      }
    }
    const neighbors = [...queue.slice(queueIndex + 1), ...queue.slice(0, queueIndex)];
    const publish = (candidates: typeof neighbors) => {
      if (active) void bridge.setSuggestedMediaAsync?.(buildMediaSuggestions(currentTrack, candidates).map(toSuggestedMediaEntry)).catch(() => {});
    };
    publish(neighbors);
    void (async () => {
      const profile = await getUserProfile();
      if (!active) return;
      const home = buildPersonalizedHome({ tracks: [], playlists: [], profile,
        personalized: settings.personalizedHome, allowExplicitRecommendations: settings.allowExplicitRecommendations });
      publish([...neighbors, ...home.continueListening]);
      if (!settings.personalizedHome || !active) return;
      const artists = currentTrack.artists?.[0];
      const related = await loadHomeRadio({ id: artists?.id, name: artists?.name || currentTrack.artistName, score: 1 }, [{ ...currentTrack, id: currentTrack.spotifyId }]);
      const allowed = related.filter((track) => settings.allowExplicitRecommendations || !track.explicit);
      publish([...allowed, ...neighbors, ...home.continueListening]);
    })().catch(() => {});
    return () => { active = false; };
  }, [bridge, currentTrack, isPlaying, queue, queueIndex, settings.personalizedHome, settings.allowExplicitRecommendations]);
  return null;
}
