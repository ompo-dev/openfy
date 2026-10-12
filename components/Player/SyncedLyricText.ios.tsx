import * as React from 'react';
import { Host, Text, VStack } from '@expo/ui/swift-ui';
import { blur, fixedSize, font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { LyricTextContent } from './LyricTextContent';

export const SyncedLyricText = React.memo(function SyncedLyricText(props: SyncedLyricTextProps) {
  const { children, active, blurred, background, fontSize = 26 } = props;
  if (active || !blurred) return <LyricTextContent {...props} />;
  // SwiftUI is only a static blur renderer. It never receives timed/nested text.
  return (
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" pointerEvents="none" style={{ width: '100%' }}>
      <VStack alignment="leading" spacing={4}>
      <Text modifiers={[
        font({ size: fontSize, weight: 'bold' }),
        foregroundStyle('rgba(255,255,255,0.48)'),
        multilineTextAlignment('leading'),
        fixedSize({ horizontal: false, vertical: true }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        blur(3),
      ]}>{children}</Text>
      {background ? <Text modifiers={[font({ size: fontSize * 19 / 26, weight: 'bold' }),
        foregroundStyle('rgba(255,255,255,0.48)'), multilineTextAlignment('leading'),
        fixedSize({ horizontal: false, vertical: true }), frame({ maxWidth: Infinity, alignment: 'leading' }),
        blur(3)]}>{background.text}</Text> : null}
      </VStack>
    </Host>
  );
});
