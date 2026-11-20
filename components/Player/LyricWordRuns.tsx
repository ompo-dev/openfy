import * as React from 'react';
import { Text } from 'react-native';
import type { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';

export const renderLyricWordRuns = (runs: ReturnType<typeof getLyricWordRuns>) =>
  runs.map((run, index) => run.progress === 0 || run.progress === 1
    ? <Text key={index} style={{ color: run.highlighted ? '#FFFFFF' : 'rgba(255,255,255,0.48)' }}>{run.text}</Text>
    : Array.from(run.text).map((character, offset, characters) => {
      const progress = Math.max(0, Math.min(1, run.progress * characters.length - offset));
      return <Text key={`${index}:${offset}`} style={{ color: `rgba(255,255,255,${0.48 + 0.52 * progress})` }}>{character}</Text>;
    }));
