import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from './Logged';
import { GlassSurface } from './GlassSurface';
import { AppIcon } from './AppIcon';
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

export function glassCircleModifiers(size: number, tint?: string) {
  return [
    swiftButtonStyle?.('glass'),
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
  const box = { width: size, height: size };

  if (IOS_NATIVE_ENABLED && systemImage) {
    return (
      <View style={[styles.host, box]}>
        <SwiftHost style={[styles.frame, box]}>
          <SwiftButton
            label={label}
            systemImage={systemImage}
            onPress={onPress}
            modifiers={glassCircleModifiers(size, tint)}
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
