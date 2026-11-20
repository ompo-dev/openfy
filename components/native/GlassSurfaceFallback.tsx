import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { GlassSurfaceFallback as GymGlassSurface } from '../../vendor/gym-notes/src/components/atoms/GlassSurfaceFallback';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';

export type GlassKind = 'regular' | 'clear' | 'thick';
export interface GlassSurfaceProps extends ViewProps {
  glass?: GlassKind;
  tintColor?: string;
  isInteractive?: boolean;
  edgeEffects?: boolean;
}

export function GlassSurfaceFallback({ glass = 'regular', edgeEffects: _edgeEffects, style, children,
  tintColor, isInteractive, ...rest }: GlassSurfaceProps) {
  const reduceBlur = useAppSettingsStore((state) => state.settings.reduceDynamicBlur);
  if (reduceBlur) return <View {...rest} style={[styles.solid, style]}>{children}</View>;
  return <GymGlassSurface {...rest} glass={glass === 'thick' ? 'regular' : glass} tintColor={tintColor}
    isInteractive={isInteractive} style={[styles.darkBacking, style]}>{children}</GymGlassSurface>;
}

const styles = StyleSheet.create({
  solid: { backgroundColor: '#303030', overflow: 'hidden' },
  darkBacking: { backgroundColor: 'rgba(38,38,40,0.82)' },
});
