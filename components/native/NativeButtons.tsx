import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from './Logged';
import { GlassSurface } from './GlassSurface';
import { AppIcon } from './AppIcon';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { NativeIconButton as GymNativeIconButton, glassCircleModifiers as gymGlassCircleModifiers } from '../../vendor/gym-notes/src/components/molecules/NativeMenuButton';
import { log } from '../../utils/appLogger';
import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftHost,
  swiftButtonBorderShape,
  swiftButtonStyle,
  swiftControlSize,
  swiftFrame,
  swiftLabelStyle,
  swiftTint,
} from './nativeUI';

export function glassCircleModifiers(size: number, tint?: string, reduceBlur = false) {
  if (!reduceBlur) return gymGlassCircleModifiers(size, tint);
  return [
    swiftButtonStyle?.(reduceBlur ? 'bordered' : 'glass'),
    swiftButtonBorderShape?.('circle'),
    swiftControlSize?.(size >= 44 ? 'extraLarge' : 'large'),
    swiftLabelStyle?.('iconOnly'),
    tint ? swiftTint?.(tint) : undefined,
    swiftFrame?.({ width: size, height: size }),
  ].filter(Boolean);
}

export function NativeIconButton({
  systemImage,
  iconName,
  label,
  tint = '#FFFFFF',
  size = 44,
  onPress,
}: {
  systemImage?: string;
  iconName?: any;
  label: string;
  tint?: string;
  size?: number;
  onPress: () => void;
}) {
  const reduceBlur = useAppSettingsStore((state) => state.settings.reduceDynamicBlur);
  const box = { width: size, height: size };

  if (IOS_NATIVE_ENABLED && systemImage) {
    if (!reduceBlur) return <GymNativeIconButton systemImage={systemImage} label={label}
      tint={tint} size={size} onPress={() => { log.ui(label); onPress(); }} />;
    return (
      <View style={[styles.host, box]}>
        <SwiftHost style={[styles.frame, box]}>
          <SwiftButton
            label={label}
            systemImage={systemImage}
            onPress={onPress}
            modifiers={glassCircleModifiers(size, tint, reduceBlur)}
          />
        </SwiftHost>
      </View>
    );
  }

  return (
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.fallback, box]}
    >
      <GlassSurface glass="regular" isInteractive style={[styles.glass, box]}>
        <AppIcon name={iconName || 'play'} size={Math.round(size * 0.48)} color={tint} />
      </GlassSurface>
    </LoggedPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
