import { requireNativeModule } from 'expo';

export type LocalAudioRepairResult = {
  uri: string;
  repaired: boolean;
  reason: 'already-compatible' | 'dash-remux';
  durationMs?: number;
  originalDurationMs?: number;
};

export default requireNativeModule<{
  repairLocalAudioAsync(uri: string): Promise<LocalAudioRepairResult>;
}>('OpenfyLocalAudio');
