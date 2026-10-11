import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AvailabilityTrack = { spotifyId?: string; id?: string; title: string; youtubeVideoId?: string;
  localAudioPath?: string; isDownloaded?: boolean };
type Failure = { reason: string; videoId?: string; at: number };
const STORAGE_KEY = 'openfy_track_availability_v1';
const TRANSIENT_FAILURE_TTL_MS = 5 * 60_000;
const keyFor = (track: AvailabilityTrack) => JSON.stringify([track.spotifyId || track.id,
  track.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase()]);
export const useTrackAvailabilityStore = create<{ failures: Record<string, Failure> }>(() => ({ failures: {} }));
let hydration: Promise<void> | undefined;
let writes = Promise.resolve();
const persist = () => {
  const snapshot = useTrackAvailabilityStore.getState().failures;
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))).catch(() => {});
};
export const hydrateTrackAvailability = () => hydration ||= AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
  if (!raw) return;
  const stored = JSON.parse(raw);
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const failures = Object.fromEntries(Object.entries(stored).filter(([, value]) => {
      const failure = value as Partial<Failure> | null;
      return failure && typeof failure.reason === 'string' && typeof failure.at === 'number' &&
        Number.isFinite(failure.at) && (failure.videoId === undefined || typeof failure.videoId === 'string');
    })) as Record<string, Failure>;
    useTrackAvailabilityStore.setState((state) => ({ failures: { ...failures, ...state.failures } }));
  }
}).catch(() => {});
export const isTrackUnavailable = (track: AvailabilityTrack, failures = useTrackAvailabilityStore.getState().failures) => {
  if (track.isDownloaded || track.localAudioPath?.startsWith('file:')) return false;
  const failure = failures[keyFor(track)];
  return Boolean(failure && failure.videoId === track.youtubeVideoId &&
    (failure.reason === 'no-canonical-match' || Date.now() - failure.at < TRANSIENT_FAILURE_TTL_MS));
};
export const markTrackUnavailable = (track: AvailabilityTrack, reason: string) => {
  useTrackAvailabilityStore.setState((state) => ({ failures: { ...state.failures,
    [keyFor(track)]: { reason, videoId: track.youtubeVideoId, at: Date.now() } } }));
  persist();
};
export const clearTrackUnavailable = (track: AvailabilityTrack) => {
  if (!useTrackAvailabilityStore.getState().failures[keyFor(track)]) return;
  useTrackAvailabilityStore.setState((state) => {
    const failures = { ...state.failures };
    delete failures[keyFor(track)];
    return { failures };
  });
  persist();
};
