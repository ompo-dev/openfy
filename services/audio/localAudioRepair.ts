import { Platform } from 'react-native';
import type { LocalAudioRepairResult } from '../../modules/openfy-local-audio';

type RepairModule = {
  repairLocalAudioAsync(uri: string): Promise<LocalAudioRepairResult>;
};

const pending = new Map<string, Promise<LocalAudioRepairResult | null>>();
const completed = new Map<string, LocalAudioRepairResult>();
const MAX_COMPLETED_REPAIRS = 200;

/** Safe to call after a completed download, or before opening an existing file. */
export const repairLocalAudioFile = (
  uri: string,
  options: { force?: boolean } = {}
): Promise<LocalAudioRepairResult | null> => {
  if (Platform.OS !== 'ios' || !/^file:\/\//i.test(uri)) {
    return Promise.resolve(null);
  }
  if (options.force) completed.delete(uri);
  const cached = completed.get(uri);
  if (cached) {
    completed.delete(uri);
    completed.set(uri, cached);
    return Promise.resolve(cached);
  }
  const existing = pending.get(uri);
  if (existing) return existing;

  let nativeModule: RepairModule;
  try {
    // Older development binaries and Expo Go do not have this module yet.
    nativeModule = require('../../modules/openfy-local-audio').default;
    if (typeof nativeModule?.repairLocalAudioAsync !== 'function') {
      return Promise.resolve(null);
    }
  } catch {
    return Promise.resolve(null);
  }

  const operation = Promise.resolve()
    .then(() => nativeModule.repairLocalAudioAsync(uri))
    .then((result) => {
      completed.delete(uri);
      completed.set(uri, result);
      while (completed.size > MAX_COMPLETED_REPAIRS) {
        const oldest = completed.keys().next().value;
        if (oldest === undefined) break;
        completed.delete(oldest);
      }
      return result;
    })
    .finally(() => pending.delete(uri));
  pending.set(uri, operation);
  return operation;
};

export const _clearLocalAudioRepairCacheForTests = () => {
  completed.clear();
  pending.clear();
};

export const prepareLocalAudioForPlayback = async (
  uri: string
): Promise<LocalAudioRepairResult | null> => {
  try {
    const result = await repairLocalAudioFile(uri);
    if (result?.repaired) {
      console.log('[LocalAudioRepair] Repaired DASH container:', {
        originalDurationMs: result.originalDurationMs,
        durationMs: result.durationMs,
      });
    }
    if (result?.protectionRelaxed) {
      console.log('[LocalAudioRepair] Adjusted iOS file protection for playback:', {
        before: result.protectionBefore,
        after: result.protectionAfter,
      });
    }
    return result;
  } catch (error) {
    // Validation/export failures preserve the original file for playback/retry.
    console.warn('[LocalAudioRepair] Could not normalize local audio:', error);
    return null;
  }
};
