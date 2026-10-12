import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftHost,
  SwiftHStack,
  SwiftImage,
  SwiftMenu,
  SwiftText,
  swiftButtonStyle,
  swiftFont,
  swiftForegroundStyle,
} from '@/components/onboarding/onboardingNative';
import { Metrics, Spacing } from '@/constants/theme';
import { useColors, useAppColorScheme } from '@/hooks/use-colors';

export interface SettingsSelectOption {
  value: string;
  label: string;
}

interface SettingsRowProps {
  leading?: ReactNode;
  disabled?: boolean;
  icon?: AppIconName;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /**
   * Turns the row into a select. On iOS it renders a native SwiftUI menu
   * `Picker`; on other platforms it falls back to a normal row that shows the
   * current label and calls `onPress` (so the caller can open its own menu).
   */
  select?: {
    value: string;
    options: readonly SettingsSelectOption[];
    onSelect: (value: string) => void;
  };
}

/** One tappable row inside a settings card: optional tinted icon, title,
 * optional subtitle, and a trailing slot (chevron, switch, or value). With
 * `select`, the row is a native menu Picker on iOS. */
export function SettingsRow({
  leading,
  disabled,
  icon,
  iconColor,
  title,
  titleColor,
  subtitle,
  trailing,
  onPress,
  select,
}: SettingsRowProps) {
  const colors = useColors();
  const scheme = useAppColorScheme();

  if (select && IOS_NATIVE_ENABLED) {
    // Native Menu (not Picker) in the trailing slot so we control the look:
    // the value in the app's secondary text colour + a single chevron.down,
    // matching the other value rows instead of the blue "⇅" default Picker.
    const currentLabel =
      select.options.find((o) => o.value === select.value)?.label ?? '';
    return (
      <View style={styles.row}>
        {leading}
        {icon ? (
          <View style={styles.iconWrap}>
            <AppIcon name={icon} color={iconColor ?? colors.text} size={20} />
          </View>
        ) : null}
        <View style={styles.text}>
          <AppText variant="body" color={titleColor} numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="secondary" color={colors.textSecondary} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <SwiftHost
          matchContents={{ horizontal: true, vertical: false }}
          colorScheme={scheme}
          style={styles.selectTrailing}>
          <SwiftMenu
            modifiers={[swiftButtonStyle?.('plain')].filter(Boolean)}
            label={
              <SwiftHStack spacing={4}>
                <SwiftText
                  modifiers={[swiftForegroundStyle?.(colors.textSecondary)].filter(Boolean)}>
                  {currentLabel}
                </SwiftText>
                <SwiftImage
                  systemName="chevron.down"
                  modifiers={[
                    swiftForegroundStyle?.(colors.textSecondary),
                    swiftFont?.({ size: 13, weight: 'semibold' }),
                  ].filter(Boolean)}
                />
              </SwiftHStack>
            }>
            {select.options.map((option) => (
              <SwiftButton
                key={option.value}
                label={option.label}
                onPress={() => select.onSelect(option.value)}
              />
            ))}
          </SwiftMenu>
        </SwiftHost>
      </View>
    );
  }

  // Non-native select: show the current label; the caller's onPress opens its menu.
  const selectedLabel = select
    ? (select.options.find((o) => o.value === select.value)?.label ?? '')
    : null;
  const resolvedTrailing =
    trailing ??
    (select ? (
      <View style={styles.selectValue}>
        <AppText variant="body" color={colors.textSecondary} numberOfLines={1}>
          {selectedLabel}
        </AppText>
        <AppIcon name="chevronDown" color={colors.textTertiary} size={16} />
      </View>
    ) : null);

  const content = (
    <View style={styles.row}>
      {leading}
      {icon ? (
        <View style={styles.iconWrap}>
          <AppIcon name={icon} color={iconColor ?? colors.text} size={20} />
        </View>
      ) : null}

      <View style={styles.text}>
        <AppText variant="body" color={titleColor} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" color={colors.textSecondary} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {resolvedTrailing ? <View style={styles.trailing}>{resolvedTrailing}</View> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <LoggedPressable
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      accessibilityRole="button"
      // Derived from the text the row already shows, so every settings row is
      // labelled without each call site repeating its title.
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </LoggedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  iconWrap: {
    width: 26,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  trailing: {
    flexShrink: 0,
  },
  selectValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  selectTrailing: {
    flexShrink: 0,
    // Fixed height (not measured) so the native Menu doesn't render shifted-up
    // on first layout and snap into place only after being tapped.
    height: 30,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
