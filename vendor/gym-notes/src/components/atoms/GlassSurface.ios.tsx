import { GlassView, type GlassStyle, isLiquidGlassAvailable } from 'expo-glass-effect';

import { GlassSurfaceFallback, type GlassSurfaceProps } from './GlassSurfaceFallback';

/**
 * iOS surface. On iOS 26 it renders the real system Liquid Glass; on older iOS
 * and in Expo Go (where the effect is unavailable) it drops to the shared
 * themed fallback. `expo-glass-effect` is imported here and nowhere else, so it
 * never reaches the Android/web bundle — that ships `GlassSurface.tsx`.
 */
export function GlassSurface({
  glass = 'regular',
  tintColor,
  isInteractive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  if (!isLiquidGlassAvailable()) {
    return (
      <GlassSurfaceFallback glass={glass} tintColor={tintColor} isInteractive={isInteractive} style={style} {...rest}>
        {children}
      </GlassSurfaceFallback>
    );
  }

  return (
    <GlassView
      glassEffectStyle={glass as GlassStyle}
      tintColor={tintColor}
      isInteractive={isInteractive}
      style={style}
      {...rest}>
      {children}
    </GlassView>
  );
}
