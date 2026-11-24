import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getExistingLocalAudioPath } from '../download/localAudioPaths';
import { prepareLocalAudioForPlayback } from '../audio/localAudioRepair';

type WaveformModule = { waveformAsync(uri: string, bins: number): Promise<number[]> };
const cache = new Map<string, number[]>();
const pending = new Map<string, Promise<number[]>>();
let queue = Promise.resolve();

export const loadMixWaveform = async (uri?: string): Promise<number[]> => {
  const native = requireOptionalNativeModule<WaveformModule>('OpenfyLocalAudio');
  if (!native?.waveformAsync || !uri) return [];
  const local = await getExistingLocalAudioPath(uri, 0);
  if (!local) return [];
  const info = await FileSystem.getInfoAsync(local);
  if (!info.exists) return [];
  const key = JSON.stringify([local, info.size, info.modificationTime]);
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const operation = queue.then(async () => {
    const repaired = await prepareLocalAudioForPlayback(local);
    const values = await native.waveformAsync(repaired?.uri || local, 1024);
    if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) return [];
    const peaks = values.map((v) => Math.max(0, Math.min(1, v)));
    cache.set(key, peaks);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    return peaks;
  }).catch(() => []).finally(() => pending.delete(key));
  pending.set(key, operation);
  queue = operation.then(() => {});
  return operation;
};

export function waveformSlice(peaks: number[], start: number, end: number, duration: number, count: number): number[] {
  if (!peaks.length || duration <= 0 || end <= start || count <= 0) return [];
  const first = Math.max(0, Math.min(peaks.length - 1, Math.floor(start / duration * peaks.length)));
  const last = Math.min(peaks.length, Math.max(first + 1, Math.ceil(end / duration * peaks.length)));
  return Array.from({ length: Math.min(count, 180) }, (_, i) => {
    const n = Math.min(count, 180);
    const a = first + Math.floor((last - first) * i / n);
    const b = Math.min(last, Math.max(a + 1, first + Math.ceil((last - first) * (i + 1) / n)));
    return Math.max(...peaks.slice(a, b));
  });
}
