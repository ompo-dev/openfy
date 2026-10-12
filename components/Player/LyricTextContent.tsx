import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';
import { useLyricClock } from './useLyricClock';
import { renderLyricWordRuns } from './LyricWordRuns';

/** The expanded player and preview share RN word runs, never nested SwiftUI Text. */
export const LyricTextContent = React.memo(function LyricTextContent({ children, active, words,
  positionMs = 0, playing = false, playbackSpeed = 1, trackId, background, fontSize = 26, wordHighlight = true,
}: SyncedLyricTextProps) {
  const clock = useLyricClock(positionMs, active, playing, playbackSpeed,
    wordHighlight ? words || background?.words : undefined, trackId, 'expanded');
  const renderText = (text: string, timings?: SyncedLyricTextProps['words']) => {
    const runs = active && wordHighlight ? getLyricWordRuns(text, timings, clock) : [];
    return runs.length ? renderLyricWordRuns(runs) : text;
  };
  return <View pointerEvents="none" style={styles.container}>
    <Text testID="lyric-text-content" style={[styles.text, { fontSize, lineHeight: fontSize + 8 }, active && styles.active]}>
      {renderText(children, words)}
    </Text>
    {background ? <Text testID="lyric-background-content" style={[styles.text, styles.background,
      { fontSize: fontSize * 19 / 26, lineHeight: fontSize }]}>{renderText(background.text, background.words)}</Text> : null}
  </View>;
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  text: { color: 'rgba(255,255,255,0.48)', fontWeight: '700', letterSpacing: 0, textAlign: 'left', width: '100%' },
  active: { color: '#FFFFFF' },
  background: { marginTop: 4 },
});
