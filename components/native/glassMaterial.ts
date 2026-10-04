import { processColor } from 'react-native';

export type GlassKind = 'regular' | 'clear' | 'thick';

// Small controls keep the artwork visible; sheets need more diffusion for readability.
export const GLASS_MATERIALS = {
  clear: { intensity: 8, blur: 2, opacity: 0.18, highlight: 0.12 },
  regular: { intensity: 20, blur: 5, opacity: 0.32, highlight: 0.17 },
  thick: { intensity: 64, blur: 16, opacity: 0.58, highlight: 0.10 },
} as const;

export function supportsAndroidGlassBlur(os: string, version: number | string) {
  return os === 'android' && Number(version) >= 31;
}

export function glassTint(tintColor: string | undefined, opacity: number) {
  if (!tintColor) return `rgba(26,28,30,${opacity})`;
  const color = processColor(tintColor);
  if (typeof color !== 'number') return tintColor;
  const alpha = (color >>> 24) / 255;
  return `rgba(${(color >>> 16) & 255},${(color >>> 8) & 255},${color & 255},${alpha === 1 ? opacity : alpha})`;
}
