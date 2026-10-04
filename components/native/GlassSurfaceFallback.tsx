import { BlurView } from 'expo-blur';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, useColorScheme, View, type ViewProps, type ViewStyle } from 'react-native';
import { useGlassBackdrop } from './GlassBackdrop';
import { GLASS_MATERIALS, glassTint, supportsAndroidGlassBlur, type GlassKind } from './glassMaterial';

/** The Liquid Glass styles mirrored here so non-iOS files never import expo-glass-effect. */
export type { GlassKind } from './glassMaterial';

export interface GlassSurfaceProps extends ViewProps {
  glass?: GlassKind;
  tintColor?: string;
  isInteractive?: boolean;
  /** Large sheets use diffusion without a raised control rim. */
  edgeEffects?: boolean;
}

/** Portable material: live diffusion, translucent tint and static specular edges. */
export const GlassSurfaceFallback = React.memo(function GlassSurfaceFallback({
  glass = 'regular',
  tintColor,
  isInteractive = false,
  edgeEffects = true,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const dark = useColorScheme() === 'dark';
  const target = useGlassBackdrop();
  // Preserve pre-iOS-26 native UIBlurEffect as well as the iOS-26 GlassView path.
  if (Platform.OS === 'ios') {
    return <BlurView intensity={glass === 'clear' ? 20 : glass === 'thick' ? 60 : 40}
      tint={dark ? 'dark' : 'light'} style={[styles.legacy, tintColor ? { backgroundColor: tintColor } : null, style]}
      {...rest}>{children}</BlurView>;
  }
  const material = GLASS_MATERIALS[glass];
  const liveBlur = supportsAndroidGlassBlur(Platform.OS, Platform.Version) && !!target;
  const flattened = StyleSheet.flatten(style) || {};
  const radii: ViewStyle = {
    borderRadius: flattened.borderRadius,
    borderTopLeftRadius: flattened.borderTopLeftRadius,
    borderTopRightRadius: flattened.borderTopRightRadius,
    borderBottomLeftRadius: flattened.borderBottomLeftRadius,
    borderBottomRightRadius: flattened.borderBottomRightRadius,
  };
  const backing = glassTint(tintColor, material.opacity);
  return (
    <View {...rest} style={[styles.base, edgeEffects && styles.depth, style]}>
      <View testID="glass-material" pointerEvents="none" accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, radii, styles.clip]}>
        {liveBlur ? <BlurView testID="glass-live-blur" blurTarget={target!}
          blurMethod="dimezisBlurViewSdk31Plus" blurReductionFactor={4}
          intensity={material.intensity} tint="default" style={StyleSheet.absoluteFill} /> : null}
        <View testID="glass-tint" style={[StyleSheet.absoluteFill, { backgroundColor: backing },
          Platform.OS === 'web' && {
            backdropFilter: `saturate(160%) blur(${material.blur}px)`,
            WebkitBackdropFilter: `saturate(160%) blur(${material.blur}px)`,
          } as ViewStyle]} />
        {edgeEffects ? <>
          <LinearGradient colors={[
            `rgba(255,255,255,${material.highlight})`, 'rgba(255,255,255,0.025)', 'rgba(0,0,0,0.08)',
          ]} locations={[0, 0.48, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill} />
          <View testID="glass-rim" style={[StyleSheet.absoluteFill, radii, styles.rim,
            isInteractive && styles.interactiveRim]} />
        </> : null}
      </View>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  clip: { overflow: 'hidden' },
  depth: {
    boxShadow: '0px 3px 10px rgba(0,0,0,0.16)',
  },
  rim: {
    boxShadow: 'inset 0px 1px 2px rgba(255,255,255,0.13), inset 0px -1px 2px rgba(0,0,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.19)',
    borderTopColor: 'rgba(255,255,255,0.42)',
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  interactiveRim: { borderTopColor: 'rgba(255,255,255,0.5)' },
  legacy: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
});
