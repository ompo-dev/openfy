import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { LoggedPressable } from '@/components/atoms/Logged';
import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftHost,
  SwiftMenu,
  swiftButtonBorderShape,
  swiftButtonStyle,
  swiftControlSize,
  swiftFrame,
  swiftLabelStyle,
  swiftTint,
} from '@/components/onboarding/onboardingNative';
import { Metrics, Radii, Spacing } from '@/constants/theme';

/**
 * The shared SwiftUI recipe: a circular glass control pinned to `size`.
 * ponytail: `controlSize` is the calibration knob — 'extraLarge' fills a 44 box
 * but overflows a smaller one, so anything under iconButton steps down a size.
 */
export function glassCircleModifiers(size: number, tint?: string) {
  return [
    swiftButtonStyle?.('glass'),
    swiftButtonBorderShape?.('circle'),
    swiftControlSize?.(size >= Metrics.iconButton ? 'extraLarge' : 'large'),
    swiftLabelStyle?.('iconOnly'),
    tint ? swiftTint?.(tint) : undefined,
    swiftFrame?.({ width: size, height: size }),
  ].filter(Boolean);
}

interface NativeMenuButtonProps {
  /** SF Symbol shown on the button itself (e.g. "ellipsis", "camera"). */
  systemImage: string;
  /** Accessibility label for the menu trigger. */
  label: string;
  /** Tints the button's symbol; omit for the default glass foreground. */
  tint?: string;
  /** Trailing gap, e.g. when it sits next to a sheet close button. */
  marginRight?: boolean;
  /** Defaults to a sheet-header button; the dock passes `Metrics.dockButton`. */
  size?: number;
  /** The menu's items — SwiftButton / nested SwiftMenu / SwiftDivider. */
  children: ReactNode;
}

/**
 * Circular glass SwiftUI menu button, sized to match the sheet's RN close
 * button (a `Metrics.iconButton` glass circle). The size recipe, tuned on
 * device: `buttonBorderShape('circle')` makes it round despite a wide symbol;
 * `controlSize('extraLarge')` grows the glass to fill the box; `frame` pins it
 * to exactly `iconButton` so it matches the X beside it. iOS-only: render
 * behind an `IOS_NATIVE_ENABLED` guard, the caller keeps its own RN fallback.
 */
export function NativeMenuButton({
  systemImage,
  label,
  tint,
  marginRight,
  size = Metrics.iconButton,
  children,
}: NativeMenuButtonProps) {
  const box = { width: size, height: size };
  return (
    <View style={[marginRight ? styles.hostMargin : styles.host, box]}>
      <SwiftHost style={[styles.frame, box]}>
        <SwiftMenu
          label={label}
          systemImage={systemImage}
          modifiers={glassCircleModifiers(size, tint)}>
          {children}
        </SwiftMenu>
      </SwiftHost>
    </View>
  );
}

/**
 * The plain-button twin of {@link NativeMenuButton}: same glass circle, same
 * size, but it just fires `onPress` instead of opening a menu. This is what
 * makes every dock button match the camera menu instead of a hand-styled pill.
 */
export function NativeIconButton({
  systemImage,
  label,
  tint,
  size = Metrics.iconButton,
  onPress,
}: {
  systemImage: string;
  label: string;
  tint?: string;
  size?: number;
  onPress: () => void;
}) {
  const box = { width: size, height: size };
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

/**
 * One dock action button, identical to its siblings on every platform:
 * a SwiftUI glass circle on iOS (like the camera menu), the RN glass fallback
 * elsewhere. Callers never branch on platform.
 */
export function DockActionButton({
  systemImage,
  icon,
  label,
  tint,
  size = Metrics.dockButton,
  onPress,
}: {
  /** SF Symbol for the native button. */
  systemImage: string;
  /** RN icon for the fallback. */
  icon: AppIconName;
  label: string;
  tint: string;
  size?: number;
  onPress: () => void;
}) {
  if (IOS_NATIVE_ENABLED) {
    return (
      <NativeIconButton
        systemImage={systemImage}
        label={label}
        tint={tint}
        size={size}
        onPress={onPress}
      />
    );
  }
  return (
    <LoggedPressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <GlassSurface
        glass="regular"
        isInteractive
        style={[styles.rnButton, { width: size, height: size }]}
      >
        <AppIcon name={icon} color={tint} size={Math.round(size * 0.5)} />
      </GlassSurface>
    </LoggedPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
  },
  hostMargin: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    marginRight: Spacing.two,
  },
  frame: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rnButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
