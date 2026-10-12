import * as React from 'react';
import { View } from 'react-native';
import { Host, RNHostView, VStack } from '@expo/ui/swift-ui';
import { blur } from '@expo/ui/swift-ui/modifiers';
import type { SyncedLyricTextProps } from './SyncedLyricText';
import { LyricTextContent } from './LyricTextContent';

export const SyncedLyricText = React.memo(function SyncedLyricText(props: SyncedLyricTextProps) {
  const [width, setWidth] = React.useState(0);
  // One RN layout owner for every state: focus only changes the native blur modifier.
  // Explicit Yoga width avoids a circular intrinsic-size dependency inside RNHostView.
  return <View style={{ width: '100%' }} onLayout={({ nativeEvent }) => {
    const next = nativeEvent.layout.width;
    if (next > 0) setWidth((previous) => previous === next ? previous : next);
  }}>
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" pointerEvents="none" style={{ width: '100%' }}>
      <VStack alignment="leading" spacing={0} testID="lyric-blur-layer"
        modifiers={[blur(props.blurred && !props.active ? 3 : 0)]}>
        <RNHostView matchContents>
          <View collapsable={false} style={{ width: width || '100%' }}>
            <LyricTextContent {...props} />
          </View>
        </RNHostView>
      </VStack>
    </Host>
  </View>;
});
