import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LyricSegment } from '../../services/lyrics/lyricsService';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';

export type SyncedLyricTextProps = {
  children: string;
  active: boolean;
  blurred: boolean;
  words?: LyricSegment['words'];
  positionMs?: number;
};

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred, words, positionMs = 0,
}: SyncedLyricTextProps) {
  const runs = active ? getLyricWordRuns(children, words, positionMs) : [];
  return (
    <View style={[styles.container, blurred && styles.blurred]}>
      <Text style={[styles.text, active && styles.active]}>{runs.length
        ? runs.map((run, index) => <Text key={index} style={run.highlighted ? styles.active : styles.pending}>{run.text}</Text>)
        : children}</Text>
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
  pending: { color: 'rgba(255,255,255,0.48)' },
});
