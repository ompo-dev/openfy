import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LyricSegment } from '../../services/lyrics/lyricsService';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';
import { useLyricClock } from './useLyricClock';

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
};

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred, words, positionMs = 0, playing = false, playbackSpeed = 1, trackId, background,
}: SyncedLyricTextProps) {
  const clock = useLyricClock(positionMs, active, playing, playbackSpeed, words || background?.words, trackId);
  const renderText = (text: string, timings?: LyricSegment['words']) => {
    const runs = active ? getLyricWordRuns(text, timings, clock) : [];
    return runs.length ? runs.map((run, index) => run.progress === 0 || run.progress === 1
      ? <Text key={index} style={run.highlighted ? styles.active : styles.pending}>{run.text}</Text>
      : Array.from(run.text).map((character, offset, characters) => {
        const progress = Math.max(0, Math.min(1, run.progress * characters.length - offset));
        return <Text key={`${index}:${offset}`} style={{ color: `rgba(255,255,255,${0.48 + 0.52 * progress})` }}>{character}</Text>;
      })) : text;
  };
  return (
    <View style={[styles.container, blurred && styles.blurred]}>
      <Text style={[styles.text, active && styles.active]}>{renderText(children, words)}</Text>
      {background ? <Text style={[styles.text, styles.background]}>{renderText(background.text, background.words)}</Text> : null}
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
  background: { fontSize: 19, lineHeight: 26, marginTop: 4 },
});
