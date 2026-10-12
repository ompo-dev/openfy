import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LyricSegment } from '../../services/lyrics/lyricsService';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';
import { useLyricClock } from './useLyricClock';
import { renderLyricWordRuns } from './LyricWordRuns';

export type SyncedLyricTextProps = {
  children: string;
  active: boolean;
  blurred: boolean;
  words?: LyricSegment['words'];
  positionMs?: number;
  playing?: boolean;
  playbackSpeed?: number;
  trackId?: string;
  background?: LyricSegment['background'];
  fontSize?: number;
};

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred, words, positionMs = 0, playing = false, playbackSpeed = 1, trackId, background, fontSize = 26,
}: SyncedLyricTextProps) {
  const clock = useLyricClock(positionMs, active, playing, playbackSpeed, words || background?.words, trackId);
  const renderText = (text: string, timings?: LyricSegment['words']) => {
    const runs = active ? getLyricWordRuns(text, timings, clock) : [];
    return runs.length ? renderLyricWordRuns(runs) : text;
  };
  return (
    <View style={[styles.container, blurred && styles.blurred]}>
      <Text style={[styles.text, { fontSize, lineHeight: fontSize + 8 }, active && styles.active]}>{renderText(children, words)}</Text>
      {background ? <Text style={[styles.text, styles.background, { fontSize: fontSize * 19 / 26,
        lineHeight: fontSize }]}>{renderText(background.text, background.words)}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  blurred: { filter: 'blur(3px)' },
  text: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: 0,
    textAlign: 'left',
    width: '100%',
  },
  active: { color: '#FFFFFF' },
  background: { fontSize: 19, lineHeight: 26, marginTop: 4 },
});
