import * as React from 'react';
import { Host, Text } from '@expo/ui/swift-ui';
import { blur, fixedSize, font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import type { SyncedLyricTextProps } from './SyncedLyricText';

export const SyncedLyricText = React.memo(function SyncedLyricText({
  children, active, blurred,
}: SyncedLyricTextProps) {
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
      ]}>{children}</Text>
    </Host>
  );
});
