/**
 * Color Contrast & Typography Auto-Adjustment Utility
 * Calculates perceived luminance (YIQ) of background colors
 * and returns harmonious text colors (never pure black).
 */

export interface NoteColorTheme {
  titleColor: string;
  artistColor: string;
  customTextColor: string;
  waveColor: string;
  tailBorderColor: string;
  isLightBg: boolean;
}

export function getNoteColorTheme(hexColor?: string): NoteColorTheme {
  if (!hexColor || hexColor === '#1C1E24' || hexColor === '#25272D' || hexColor === '#000000') {
    return {
      titleColor: '#FFFFFF',
      artistColor: 'rgba(255, 255, 255, 0.68)',
      customTextColor: 'rgba(255, 255, 255, 0.52)',
      waveColor: '#FFFFFF',
      tailBorderColor: 'rgba(255, 255, 255, 0.25)',
      isLightBg: false,
    };
  }

  // Parse Hex to RGB
  const cleanHex = hexColor.replace('#', '');
  let r = 0;
  let g = 0;
  let b = 0;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16) || 0;
    g = parseInt(cleanHex[1] + cleanHex[1], 16) || 0;
    b = parseInt(cleanHex[2] + cleanHex[2], 16) || 0;
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  }

  // YIQ Perceived Brightness formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  if (yiq >= 135) {
    // Light background: warm dark amber/charcoal tint (NEVER pure black)
    return {
      titleColor: 'rgba(24, 20, 14, 0.88)',
      artistColor: 'rgba(24, 20, 14, 0.72)',
      customTextColor: 'rgba(24, 20, 14, 0.60)',
      waveColor: 'rgba(24, 20, 14, 0.88)',
      tailBorderColor: 'rgba(0, 0, 0, 0.15)',
      isLightBg: true,
    };
  } else {
    // Dark background: crisp white text
    return {
      titleColor: '#FFFFFF',
      artistColor: 'rgba(255, 255, 255, 0.72)',
      customTextColor: 'rgba(255, 255, 255, 0.58)',
      waveColor: '#FFFFFF',
      tailBorderColor: 'rgba(255, 255, 255, 0.28)',
      isLightBg: false,
    };
  }
}
