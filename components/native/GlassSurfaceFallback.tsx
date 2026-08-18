import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, useColorScheme, type ViewProps } from 'react-native';

/** The Liquid Glass styles mirrored here so non-iOS files never import expo-glass-effect. */
export type GlassKind = 'regular' | 'clear' | 'thick';

export interface GlassSurfaceProps extends ViewProps {
  glass?: GlassKind;
  tintColor?: string;
  isInteractive?: boolean;
}

const isAndroid = Platform.OS === 'android';

/**
 * Frosted surface for every platform without Apple's real Liquid Glass.
 * iOS (below 26) keeps the clean native UIBlurEffect.
 * Android uses a grounded translucent surface (no live blur, no halo).
 * `overflow: 'hidden'` is what makes the blur actually clip to borderRadius.
 */
export function GlassSurfaceFallback({
  glass = 'regular',
  tintColor: _tintColor,
  isInteractive: _isInteractive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const dark = useColorScheme() === 'dark';

  const backing = isAndroid
    ? dark
      ? 'rgba(28,28,30,0.85)'
      : 'rgba(255,255,255,0.85)'
    : undefined;

  const intensity =
    glass === 'clear' ? 20 : glass === 'thick' ? 60 : 40;

  return (
    <BlurView
      intensity={isAndroid ? 12 : intensity}
      tint={dark ? 'dark' : 'light'}
      experimentalBlurMethod="none"
      style={[
        styles.base,
        backing ? { backgroundColor: backing } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
});
