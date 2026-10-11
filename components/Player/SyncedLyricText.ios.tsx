import * as React from 'react';
import { Host, Text } from '@expo/ui/swift-ui';
import { blur, fixedSize, font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { getLyricWordRuns } from '../../services/lyrics/lyricTimeline';

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred, words, positionMs = 0,
}: SyncedLyricTextProps) {
  const runs = active ? getLyricWordRuns(children, words, positionMs) : [];
  // RN's blur filter is not supported on iOS; use the existing ExpoUI renderer.
  return (
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" pointerEvents="none" style={{ width: '100%' }}>
      <Text modifiers={[
        font({ size: 26, weight: 'bold' }),
        foregroundStyle(active ? '#FFFFFF' : 'rgba(255,255,255,0.48)'),
        multilineTextAlignment('leading'),
        fixedSize({ horizontal: false, vertical: true }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        blur(blurred ? 3 : 0),
      ]}>{runs.length ? runs.map((run, index) => <Text key={index}
        modifiers={[foregroundStyle(run.highlighted ? '#FFFFFF' : 'rgba(255,255,255,0.48)')]}>{run.text}</Text>) : children}</Text>
    </Host>
  );
});
