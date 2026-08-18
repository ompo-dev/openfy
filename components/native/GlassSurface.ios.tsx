import { GlassView, type GlassStyle, isLiquidGlassAvailable } from 'expo-glass-effect';

import { GlassSurfaceFallback, type GlassSurfaceProps } from './GlassSurfaceFallback';

/**
 * iOS surface. On iOS 26+ it renders the real system Liquid Glass.
 * On older iOS and in Expo Go it drops to the shared themed fallback.
 * `expo-glass-effect` is imported ONLY here and never reaches Android/web bundle.
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
      <GlassSurfaceFallback
        glass={glass}
        tintColor={tintColor}
        isInteractive={isInteractive}
        style={style}
        {...rest}
      >
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
      {...rest}
    >
      {children}
    </GlassView>
  );
}

export type { GlassSurfaceProps, GlassKind } from './GlassSurfaceFallback';
