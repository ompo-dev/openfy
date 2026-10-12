import * as React from 'react';
import { log } from '../../utils/appLogger';
import type { LyricSegment } from '../../services/lyrics/lyricsService';

export const extrapolateLyricPosition = (positionMs: number, elapsedMs: number, rate: number) =>
  positionMs + Math.max(0, Math.min(750, elapsedMs)) * rate;

export const useLyricClock = (positionMs: number, active: boolean, playing: boolean, rate: number,
  words?: LyricSegment['words'], trackId?: string, surface?: 'expanded' | 'preview') => {
  const [clock, setClock] = React.useState(positionMs);
  React.useEffect(() => {
    setClock(positionMs);
    if (!active || !playing || !words?.length) return;
    const start = Date.now();
    const timer = setInterval(() => setClock(extrapolateLyricPosition(positionMs, Date.now() - start, rate)), 33);
    return () => clearInterval(timer);
  }, [positionMs, active, playing, rate, words]);
  React.useEffect(() => {
    if (active && words?.length) log.player('lyrics word renderer active', { trackId, surface, renderer: 'react-native', words: words.length,
      syllables: words.reduce((count, word) => count + (word.syllables?.length || 1), 0) });
  }, [active, words, trackId, surface]);
  return active && playing && words?.length ? clock : positionMs;
};
