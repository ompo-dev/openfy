import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppText } from '@/components/atoms/AppText';
import {
  IOS_NATIVE_ENABLED,
  SwiftHost,
  SwiftPicker,
  SwiftText,
  swiftPickerStyle,
  swiftTag,
  swiftDisabled,
} from '@/components/onboarding/onboardingNative';
import { Radii, Spacing } from '@/constants/theme';
import { useColors, useAppColorScheme } from '@/hooks/use-colors';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface NativeSegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

/**
 * The iOS segmented control when Expo UI is present, hand-rolled pills when it
 * is not (Expo Go, Android). Same API either way, so callers never branch.
 */
export function NativeSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: NativeSegmentedProps<T>) {
  const colors = useColors();
  const scheme = useAppColorScheme();

  if (IOS_NATIVE_ENABLED) {
    return (
      // Stretch to full width (hug height only) so the segmented control fills
      // the row instead of hugging its labels.
      <SwiftHost
        style={styles.host}
        colorScheme={scheme}
        matchContents={{ horizontal: false, vertical: true }}>
        <SwiftPicker
          selection={value}
          onSelectionChange={(next: string) => { if (!disabled) onChange(next as T); }}
          modifiers={[swiftPickerStyle('segmented'), swiftDisabled?.(disabled)].filter(Boolean)}
        >
          {options.map((option) => (
            <SwiftText key={option.value} modifiers={[swiftTag(option.value)]}>
              {option.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      </SwiftHost>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <LoggedPressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            disabled={disabled}
            style={[
              styles.pill,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : 'transparent',
              },
            ]}
          >
            <AppText
              variant="label"
              numberOfLines={1}
              color={selected ? colors.background : colors.textSecondary}
            >
              {option.label}
            </AppText>
          </LoggedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    height: 34,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
});
