import { Platform } from 'react-native';
import type { LocalAudioRepairResult } from '../../modules/openfy-local-audio';

type RepairModule = {
  repairLocalAudioAsync(uri: string): Promise<LocalAudioRepairResult>;
};

const pending = new Map<string, Promise<LocalAudioRepairResult | null>>();

/** Safe to call after a completed download, or before opening an existing file. */
export const repairLocalAudioFile = (
  uri: string
): Promise<LocalAudioRepairResult | null> => {
  if (Platform.OS !== 'ios' || !/^file:\/\//i.test(uri)) {
    return Promise.resolve(null);
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
    .finally(() => pending.delete(uri));
  pending.set(uri, operation);
  return operation;
};

export const prepareLocalAudioForPlayback = async (uri: string): Promise<void> => {
  try {
    const result = await repairLocalAudioFile(uri);
    if (result?.repaired) {
      console.log('[LocalAudioRepair] Repaired DASH container:', {
        originalDurationMs: result.originalDurationMs,
        durationMs: result.durationMs,
      });
    }
  } catch (error) {
    // Validation/export failures preserve the original file for playback/retry.
    console.warn('[LocalAudioRepair] Could not normalize local audio:', error);
  }
};
