import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getExistingLocalAudioPath } from '../download/localAudioPaths';
import { getDownloadedTrack } from '../download/downloadManager';
import { prepareLocalAudioForPlayback } from '../audio/localAudioRepair';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../../utils/appLogger';
import type { RhythmAnalysis } from './mixBeats';

type WaveformModule = { waveformAsync(uri: string, bins: number): Promise<number[]>; rhythmAsync?(uri: string): Promise<number[]>; supportsDetailedWaveform?: boolean };
const cache = new Map<string, number[]>();
const pending = new Map<string, Promise<number[]>>();
let queue = Promise.resolve();
const STORAGE_KEY = 'openfy_mix_waveforms_v1';
const rhythmCache = new Map<string, RhythmAnalysis>();
const rhythmPending = new Map<string, Promise<RhythmAnalysis | null>>();
let restored = false;
const restore = async () => {
  if (restored) return;
  restored = true;
  try {
    const entries = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]') as [string, number[]][];
    if (Array.isArray(entries)) for (const [key, peaks] of entries.slice(-64)) {
      if (typeof key === 'string' && Array.isArray(peaks) && peaks.length === 1024 &&
        peaks.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) cache.set(key, peaks);
    }
  } catch { /* Rebuild corrupt cache from the downloaded audio. */ }
};

export const loadMixWaveform = async (uri?: string, trackId?: string, detailed = false): Promise<number[]> => {
  let local = await getExistingLocalAudioPath(uri, 0);
  // A library snapshot can be stale immediately after download or a sandbox migration.
  if (!local && trackId) {
    local = await getExistingLocalAudioPath((await getDownloadedTrack(trackId))?.localAudioPath, 0);
  }
  if (!local) return [];
  const path = local;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return [];
  const key = JSON.stringify([path, info.size, info.modificationTime, ...(detailed ? ['detail'] : [])]);
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const operation = queue.then(async () => {
    await restore();
    if (cache.has(key)) return cache.get(key)!;
    const native = requireOptionalNativeModule<WaveformModule>('OpenfyLocalAudio');
    if (typeof native?.waveformAsync !== 'function') {
      log.error('mix waveform unavailable in installed native build', {});
      return [];
    }
    let values: number[];
    const bins = detailed ? (native.supportsDetailedWaveform ? 32768 : 2048) : 1024;
    try { values = await native.waveformAsync(path, bins); }
    catch {
      const repaired = await prepareLocalAudioForPlayback(path);
      values = await native.waveformAsync(repaired?.uri || path, bins);
    }
    if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) return [];
    const peaks = values.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000);
    cache.set(key, peaks);
    if (detailed) {
      const detailedKeys = [...cache.keys()].filter((entry) => entry.endsWith(',"detail"]'));
      while (detailedKeys.length > 4) cache.delete(detailedKeys.shift()!);
    }
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    if (!detailed) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...cache].filter(([, values]) => values.length === 1024))).catch(() => {});
    return peaks;
  }).catch((error) => {
    log.error('mix waveform decode failed', { error });
    return [];
  }).finally(() => pending.delete(key));
  pending.set(key, operation);
  queue = operation.then(() => {});
  return operation;
};

export async function loadMixRhythm(uri?: string, trackId?: string): Promise<RhythmAnalysis | null> {
  const native = requireOptionalNativeModule<WaveformModule>('OpenfyLocalAudio');
  if (!native?.rhythmAsync) return null;
  let path = await getExistingLocalAudioPath(uri, 0);
  if (!path && trackId) path = await getExistingLocalAudioPath((await getDownloadedTrack(trackId))?.localAudioPath, 0);
  if (!path) return null;
  const local = path;
  const info = await FileSystem.getInfoAsync(local);
  if (!info.exists) return null;
  const key = JSON.stringify([local, info.size, info.modificationTime]);
  if (rhythmCache.has(key)) return rhythmCache.get(key)!;
  if (rhythmPending.has(key)) return rhythmPending.get(key)!;
  const operation = queue.then(async () => {
    let bands: number[];
    try { bands = await native.rhythmAsync!(local); }
    catch {
      const repaired = await prepareLocalAudioForPlayback(local);
      bands = await native.rhythmAsync!(repaired?.uri || local);
    }
    if (!Array.isArray(bands) || !bands.length || bands.length % 3 || bands.length > 1080000 || !bands.every(Number.isFinite)) return null;
    const analysis = { hopMs: 10, bands };
    rhythmCache.set(key, analysis);
    while (rhythmCache.size > 4) rhythmCache.delete(rhythmCache.keys().next().value!);
    return analysis;
  }).catch((error) => { log.error('mix rhythm analysis failed', { error }); return null; }).finally(() => rhythmPending.delete(key));
  rhythmPending.set(key, operation);
  queue = operation.then(() => {});
  return operation;
}

export function waveformSlice(peaks: number[], start: number, end: number, duration: number, count: number): number[] {
  if (!peaks.length || ![start, end, duration, count].every(Number.isFinite) || duration <= 0 || end <= start || count <= 0) return [];
  const first = Math.max(0, Math.min(peaks.length - 1, Math.floor(start / duration * peaks.length)));
  const last = Math.min(peaks.length, Math.max(first + 1, Math.ceil(end / duration * peaks.length)));
  return Array.from({ length: Math.min(count, 180) }, (_, i) => {
    const n = Math.min(count, 180);
    const a = first + Math.floor((last - first) * i / n);
    const b = Math.min(last, Math.max(a + 1, first + Math.ceil((last - first) * (i + 1) / n)));
    return Math.max(...peaks.slice(a, b));
  });
}
