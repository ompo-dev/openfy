import type { AudioQuality } from '../settings/appSettings';

export const streamSelectionQuality = (quality: AudioQuality): 'best' | 'bestefficiency' =>
  quality === 'economy' ? 'bestefficiency' : 'best';

export const audioQualityCacheKey = (identity: string, quality: AudioQuality): string =>
  `${quality}:${identity}`;

export const AUDIO_QUALITY_LABELS: Record<AudioQuality, string> = {
  high: 'Alta',
  economy: 'Economia de dados',
};
