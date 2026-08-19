export type AudioFormat =
  | 'AAC'
  | 'MP3'
  | 'OPUS'
  | 'HLS'
  | 'UNKNOWN';

export interface AudioSource {
  provider: string;
  url: string;
  format: AudioFormat;
  bitrate?: number;
  durationMs?: number;
  expiresAt?: string;
  verified: boolean;
}
