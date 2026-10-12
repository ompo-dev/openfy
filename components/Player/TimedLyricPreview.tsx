import * as React from 'react';
import { Text, type TextProps } from 'react-native';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';
import { useLyricClock } from './useLyricClock';
import { renderLyricWordRuns } from './LyricWordRuns';

type Props = Pick<SyncedLyricTextProps, 'children' | 'active' | 'words' | 'positionMs' | 'playing' | 'playbackSpeed' | 'trackId'> &
  Pick<TextProps, 'style' | 'onTextLayout' | 'numberOfLines' | 'testID'>;

export const TimedLyricPreview = React.memo(function TimedLyricPreview({ children, active, words,
  positionMs = 0, playing = false, playbackSpeed = 1, trackId, ...textProps }: Props) {
  const clock = useLyricClock(positionMs, active, playing, playbackSpeed, words, trackId);
  const runs = active ? getLyricWordRuns(children, words, clock) : [];
  return <Text {...textProps} ellipsizeMode="tail">{runs.length ? renderLyricWordRuns(runs) : children}</Text>;
});
