import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { getTrackYouTubeVideoId, getLinkedYouTubeVideoId, type YouTubeTrackReference } from '../services/spotify/linkParser';
import { hasConfirmedCatalogMapping, hydrateCatalogMappings } from '../services/audio/catalogMappingCache';

export type AvailabilityTrack = YouTubeTrackReference & { title: string;
  localAudioPath?: string; isDownloaded?: boolean; audioUrl?: string; streamUrl?: string };
type Failure = { reason: string; videoId?: string; at: number };
// Old flags did not identify URL/alternate-ID sources and can contain permanent false negatives.
const STORAGE_KEY = 'openfy_track_availability_v2';
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
export const hydrateTrackAvailability = () => hydration ||= Promise.all([
  AsyncStorage.getItem(STORAGE_KEY), hydrateCatalogMappings(),
]).then(([raw]) => {
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
/** Queue cooldowns include transport failures; repair UI only uses confirmed missing recordings. */
export const isTrackUnavailable = (track: AvailabilityTrack, failures = useTrackAvailabilityStore.getState().failures, includeTransient = true) => {
  if (track.isDownloaded || track.localAudioPath?.startsWith('file:')) return false;
  // A concrete YouTube URL and a confirmed catalog mapping are candidates for
  // playback. Old canonical-search misses must never hide those recordings.
  // Actual HTTP/decoder failures are still reported by the player.
  if (getLinkedYouTubeVideoId(track) && !(track.spotifyId || track.id || '').startsWith('yt_')) return false;
  if (hasConfirmedCatalogMapping(track.spotifyId || track.id)) return false;
  if (/^https?:\/\//i.test(track.streamUrl || track.audioUrl || '')) return false;
  const failure = failures[keyFor(track)];
  return Boolean(failure && failure.videoId === getTrackYouTubeVideoId(track) &&
    (failure.reason === 'no-canonical-match' || includeTransient && Date.now() - failure.at < TRANSIENT_FAILURE_TTL_MS));
};
export const markTrackUnavailable = (track: AvailabilityTrack, reason: string) => {
  useTrackAvailabilityStore.setState((state) => ({ failures: { ...state.failures,
    [keyFor(track)]: { reason, videoId: getTrackYouTubeVideoId(track), at: Date.now() } } }));
  persist();
};
/** Clear stale error badges for a whole imported playlist in a single write. */
export const clearTrackUnavailableMany = (tracks: AvailabilityTrack[]): void => {
  const current = useTrackAvailabilityStore.getState().failures;
  const next = { ...current };
  let changed = false;
  tracks.forEach((track) => {
    const key = keyFor(track);
    if (key in next) { delete next[key]; changed = true; }
  });
  if (!changed) return;
  useTrackAvailabilityStore.setState({ failures: next });
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
