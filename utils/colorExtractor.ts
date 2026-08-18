/**
 * Color Extractor Utility
 * Generates rich Spotify-like dynamic gradient color palettes for album art
 */

// Saturated and deep Spotify dynamic background gradients
const SPOTIFY_PALETTES = [
  { primary: '#6b21a8', secondary: '#2e1065', accent: '#c084fc' }, // Purple
  { primary: '#1e40af', secondary: '#0f172a', accent: '#38bdf8' }, // Deep Blue
  { primary: '#047857', secondary: '#064e3b', accent: '#34d399' }, // Emerald Teal
  { primary: '#be123c', secondary: '#4c0519', accent: '#fb7185' }, // Crimson Red
  { primary: '#c2410c', secondary: '#431407', accent: '#fb923c' }, // Warm Amber
  { primary: '#a21caf', secondary: '#4a044e', accent: '#f472b6' }, // Magenta
  { primary: '#15803d', secondary: '#14532d', accent: '#4ade80' }, // Forest Green
  { primary: '#4338ca', secondary: '#1e1b4b', accent: '#818cf8' }, // Indigo
  { primary: '#0e7490', secondary: '#083344', accent: '#22d3ee' }, // Ocean Cyan
  { primary: '#b45309', secondary: '#451a03', accent: '#fcd34d' }, // Gold Bronze
];

/**
 * Generate a consistent dynamic palette for a track based on its title and artist
 */
export const getDynamicColorPalette = (
  seedText: string
): { primary: string; secondary: string; accent: string } => {
  if (!seedText) {
    return SPOTIFY_PALETTES[0];
  }

  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash << 5) - hash + seedText.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % SPOTIFY_PALETTES.length;
  return SPOTIFY_PALETTES[index];
};
