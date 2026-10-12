import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { LyricSegment } from '../../services/lyrics/lyricsService';
import { LyricTextContent } from './LyricTextContent';

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
  wordHighlight?: boolean;
};

export const SyncedLyricText = React.memo(function SyncedLyricText(props: SyncedLyricTextProps) {
  return (
    <View style={[styles.container, props.blurred && !props.active && styles.blurred]}>
      <LyricTextContent {...props} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%' },
  blurred: { filter: 'blur(3px)' },
});
