import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, type ViewProps } from 'react-native';

import { useColors, useAppColorScheme } from '@/hooks/use-colors';

/** The Liquid Glass styles, mirrored here so the shared/fallback files never
 *  have to import `expo-glass-effect` just for its type. */
export type GlassKind = 'regular' | 'clear';

export interface GlassSurfaceProps extends ViewProps {
  glass?: GlassKind;
  tintColor?: string;
  isInteractive?: boolean;
}

const isAndroid = Platform.OS === 'android';

/**
 * Frosted surface for every platform without Apple's real Liquid Glass.
 *
 * iOS (below 26) keeps the clean native `UIBlurEffect`. Android's live blur
 * (`dimezisBlurView`) glowed and read far too transparent, so there it drops to
 * a grounded translucent surface (`experimentalBlurMethod="none"` renders a
 * plain semi-transparent view) backed by a near-opaque tint — no halo, no
 * see-through. `overflow: 'hidden'` is what makes the blur actually clip to the
 * caller's `borderRadius`; without it the glass buttons rendered square.
 */
export function GlassSurfaceFallback({
  glass = 'regular',
  tintColor: _tintColor,
  isInteractive: _isInteractive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const colors = useColors();
  const dark = useAppColorScheme() === 'dark';

  const backing = isAndroid
    ? dark
      ? 'rgba(38,38,40,0.82)'
      : 'rgba(255,255,255,0.82)'
    : undefined;

  return (
    <BlurView
      intensity={isAndroid ? 12 : glass === 'clear' ? 24 : 40}
      tint={dark ? 'dark' : 'light'}
      experimentalBlurMethod="none"
      style={[
        styles.base,
        { borderColor: colors.border },
        backing ? { backgroundColor: backing } : null,
        style,
      ]}
      {...rest}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
