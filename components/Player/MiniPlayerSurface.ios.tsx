import { Host, VStack } from '@expo/ui/swift-ui';
import { frame, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';
import { GlassSurfaceFallback } from '../native/GlassSurfaceFallback';
import type { MiniPlayerSurfaceProps } from './MiniPlayerSurface';

export const MiniPlayerSurface = ({ children, style }: MiniPlayerSurfaceProps) => {
  if (!isLiquidGlassAvailable()) {
    return <GlassSurfaceFallback glass="regular" style={style}>{children}</GlassSurfaceFallback>;
  }

  return (
    <View style={style}>
      {/* The SwiftUI material owns the backing. RN content retains its touch
          targets and marquee masks without clipping/rasterizing the glass. */}
      <Host pointerEvents="none" colorScheme="dark" ignoreSafeArea="all" style={StyleSheet.absoluteFill}>
        <VStack modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
        ]}>{null}</VStack>
      </Host>
      {children}
    </View>
  );
};
