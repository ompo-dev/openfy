/**
 * Color Contrast & Typography Auto-Adjustment Utility
 * Calculates perceived luminance (YIQ / WCAG standards) of any background color
 * and returns mathematically optimized harmonious text and icon colors.
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
    // Light background (pastels, bright yellows, soft pinks, cyans, light greens)
    // Deep harmonious dark slate ink text that is crystal clear and never jarring
    return {
      titleColor: '#0F172A',
      artistColor: 'rgba(15, 23, 42, 0.75)',
      customTextColor: 'rgba(15, 23, 42, 0.62)',
      waveColor: '#0F172A',
      tailBorderColor: 'rgba(0, 0, 0, 0.2)',
      isLightBg: true,
    };
  } else {
    // Dark / saturated background (deep purples, reds, dark blues, dark greens)
    // Crisp pure white text
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
