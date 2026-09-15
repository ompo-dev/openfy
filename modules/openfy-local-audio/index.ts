import { requireNativeModule } from 'expo';

export type LocalAudioRepairResult = {
  uri: string;
  repaired: boolean;
  protectionRelaxed?: boolean;
  protectionBefore?: string;
  protectionAfter?: string;
  reason: 'already-compatible' | 'dash-remux';
  durationMs?: number;
  originalDurationMs?: number;
};

export default requireNativeModule<{
  repairLocalAudioAsync(uri: string): Promise<LocalAudioRepairResult>;
}>('OpenfyLocalAudio');
