import * as React from 'react';
import { Host, Text, VStack } from '@expo/ui/swift-ui';
import { blur, fixedSize, font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';
import { useLyricClock } from './useLyricClock';

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred, words, positionMs = 0, playing = false, playbackSpeed = 1, trackId, background, fontSize = 26,
}: SyncedLyricTextProps) {
  const clock = useLyricClock(positionMs, active, playing, playbackSpeed, words || background?.words, trackId);
  const renderText = (text: string, timings?: SyncedLyricTextProps['words']) => {
    const runs = active ? getLyricWordRuns(text, timings, clock) : [];
    return runs.length ? runs.map((run, index) => <Text key={index} modifiers={[foregroundStyle(
      run.progress === 0 || run.progress === 1 ? run.highlighted ? '#FFFFFF' : 'rgba(255,255,255,0.48)' : {
        type: 'linearGradient', colors: ['#FFFFFF', 'rgba(255,255,255,0.48)'],
        startPoint: { x: run.progress - 0.02, y: 0 }, endPoint: { x: run.progress + 0.02, y: 0 },
      })]}>{run.text}</Text>) : text;
  };
  const content = renderText(children, words);
  const backgroundContent = background ? renderText(background.text, background.words) : null;
  // RN's blur filter is not supported on iOS; use the existing ExpoUI renderer.
  return (
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" pointerEvents="none" style={{ width: '100%' }}>
      <VStack alignment="leading" spacing={4}>
      {/* ExpoUI retains its native text field when children replace a string. Remount only on mode changes. */}
      <Text key={Array.isArray(content) ? 'timed' : 'plain'} modifiers={[
        font({ size: fontSize, weight: 'bold' }),
        foregroundStyle(active ? '#FFFFFF' : 'rgba(255,255,255,0.48)'),
        multilineTextAlignment('leading'),
        fixedSize({ horizontal: false, vertical: true }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        blur(blurred ? 3 : 0),
      ]}>{content}</Text>
      {background ? <Text key={Array.isArray(backgroundContent) ? 'background-timed' : 'background-plain'} modifiers={[font({ size: fontSize * 19 / 26, weight: 'bold' }),
        foregroundStyle('rgba(255,255,255,0.48)'), multilineTextAlignment('leading'),
        fixedSize({ horizontal: false, vertical: true }), frame({ maxWidth: Infinity, alignment: 'leading' }),
        blur(blurred ? 3 : 0)]}>{backgroundContent}</Text> : null}
      </VStack>
    </Host>
  );
});
