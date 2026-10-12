import type { ReactNode, RefObject } from "react";
import { ActivityIndicator, StyleSheet, Switch, useWindowDimensions, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import type { AppModalAnchor } from "@/core/appModals";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

import { SheetFrame } from "../SheetFrame";
import { settingsStyles } from "./styles";


// Tints pulled from the reference screenshots (no theme token for these).
export const TINT = {
  blue: "#2E9BFF",
  purple: "#8B5CF6",
  indigo: "#6366F1",
  magenta: "#E45AC0",
};
const OPTION_MENU_WIDTH = 250;
const OPTION_MENU_RADIUS = 26;

export type OptionMenuItem<T extends string> = {
  icon?: AppIconName;
  label: string;
  value: T;
};

export const noop = () => {};

export function measureOptionAnchor(
  ref: RefObject<View | null>,
  onMeasure: (anchor: AppModalAnchor | null) => void,
) {
  if (!ref.current) {
    onMeasure(null);
    return;
  }
  ref.current.measureInWindow((x, y, width, height) => {
    onMeasure({ x, y, width, height });
  });
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

export function formatThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={settingsStyles.section}>
      <AppText
        variant="caption"
        color={colors.textTertiary}
        style={settingsStyles.sectionLabel}
      >
        {label}
      </AppText>
      <View
        style={[
          settingsStyles.card,
          { backgroundColor: colors.backgroundElement },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

export function Chevron() {
  const colors = useColors();
  return <AppIcon name="chevronRight" color={colors.textTertiary} size={18} />;
}

export function ValueTrailing({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.value}>
      <AppText variant="secondary" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppIcon name="chevronDown" color={colors.textTertiary} size={16} />
    </View>
  );
}

export function OptionMenu<T extends string>({
  visible,
  anchor,
  selectedValue,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  anchor: AppModalAnchor | null;
  selectedValue: T;
  options: readonly OptionMenuItem<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  if (!visible) return null;

  const menuHeight = options.length * 52 + Spacing.one * 2;
  const preferredRight = anchor
    ? Math.round(windowWidth - (anchor.x + anchor.width) + Spacing.two)
    : Spacing.six;
  const right = Math.max(
    Spacing.two,
    Math.min(windowWidth - OPTION_MENU_WIDTH - Spacing.two, preferredRight),
  );
  const menuPosition = {
    top: anchor
      ? Math.max(Spacing.two, Math.round(anchor.y + anchor.height - menuHeight))
      : Spacing.eight,
    right,
  };

  return (
    <View style={styles.optionMenuOverlay}>
      <LoggedPressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />

      <GlassSurface glass="regular" style={[styles.optionMenu, menuPosition]}>
        {options.map((option) => {
          const selected = option.value === selectedValue;
          return (
            <LoggedPressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.optionMenuRow,
                pressed && settingsStyles.pressed,
              ]}
            >
              <View style={styles.optionMenuCheckSlot}>
                {selected ? (
                  <AppIcon name="check" color={colors.text} size={26} />
                ) : null}
              </View>
              <AppText variant="body" style={styles.optionMenuText}>
                {option.label}
              </AppText>
            </LoggedPressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

export function Toggle({
  value,
  onValueChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Names the switch for the screen reader — the row's title next to it. */
  label?: string;
  disabled?: boolean;
}) {
  const colors = useColors();

  // RN Switch IS the native iOS UISwitch and centres correctly in the row. The
  // @expo/ui SwiftUI Toggle top-aligned inside its Host no matter how it was
  // sized (fixed height and matchContents both failed), so we keep the native
  // switch here — same control, no alignment bug.
  return (
    <Switch
      disabled={disabled}
      accessibilityState={{ disabled }}
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.success, false: colors.backgroundSelected }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.backgroundSelected}
    />
  );
}

export function HeaderIconButton({
  icon,
  onPress,
  filled = false,
  label,
  disabled = false,
  busy = false,
}: {
  icon: "x" | "check" | "plus";
  onPress: () => void;
  filled?: boolean;
  label?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const colors = useColors();
  const color = filled ? "#FFFFFF" : colors.textSecondary;
  return (
    <LoggedPressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === "x" ? t("common.close") : t("settings.done"))}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      style={({ pressed }) => [pressed && settingsStyles.pressed, (disabled || busy) && { opacity: 0.4 }]}
    >
      {filled ? (
        <View
          style={[styles.headerIconButton, { backgroundColor: colors.success }]}
        >
          {busy ? <ActivityIndicator color={color} size="small" /> : <AppIcon name={icon} color={color} size={22} />}
        </View>
      ) : (
        <GlassSurface
          glass="regular"
          isInteractive
          style={styles.headerIconButton}
        >
          {busy ? <ActivityIndicator color={color} size="small" /> : <AppIcon name={icon} color={color} size={22} />}
        </GlassSurface>
      )}
    </LoggedPressable>
  );
}

export function PageSheet({
  visible,
  title,
  onClose,
  onDismiss,
  onSave,
  children,
  overlay,
  nested,
  contentBottomInset,
  keyboardAwareScroll,
  scroll,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  onSave?: () => void;
  children: ReactNode;
  overlay?: ReactNode;
  /** Sheet stacked on top of this one — see `SheetFrame`'s `nested`. */
  nested?: ReactNode;
  contentBottomInset?: number;
  keyboardAwareScroll?: boolean;
  /** false when the content is a native SwiftUI Form that scrolls itself. */
  scroll?: boolean;
}) {
  return (
    <SheetFrame
      visible={visible}
      title={title}
      onClose={onClose}
      onDismiss={onDismiss}
      centerTitle
      hideDefaultClose={Boolean(onSave)}
      keyboardAwareScroll={keyboardAwareScroll}
      contentBottomInset={contentBottomInset}
      scroll={scroll}
      overlay={overlay}
      nested={nested}
      headerLeading={
        onSave ? <HeaderIconButton icon="x" onPress={onClose} /> : null
      }
      headerTrailing={
        onSave ? (
          <HeaderIconButton icon="check" filled onPress={onSave} />
        ) : null
      }
      size="full"
    >
      {children}
    </SheetFrame>
  );
}

export function NumberUnit({
  value,
  unit,
}: {
  value: string | number;
  unit: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.numberUnit}>
      <AppText variant="body" style={styles.metricValueText}>
        {value}
      </AppText>
      <AppText variant="body" color={colors.textTertiary}>
        {unit}
      </AppText>
    </View>
  );
}

export function DisclosureValue({ value }: { value: string }) {
  const colors = useColors();
  return (
    <View style={styles.disclosureValue}>
      <AppText
        variant="secondary"
        color={colors.textSecondary}
        numberOfLines={2}
        style={styles.disclosureText}
      >
        {value}
      </AppText>
      <Chevron />
    </View>
  );
}

const styles = StyleSheet.create({
  disclosureText: {
    textAlign: "right",
  },
  disclosureValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.one,
    maxWidth: 220,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
  },
  headerIconButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValueText: {
    fontVariant: ["tabular-nums"],
  },
  numberUnit: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
  },
  optionMenu: {
    position: "absolute",
    width: OPTION_MENU_WIDTH,
    borderRadius: OPTION_MENU_RADIUS,
    paddingVertical: Spacing.one,
    overflow: "hidden",
  },
  optionMenuCheckSlot: {
    width: 26,
    alignItems: "center",
  },
  optionMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  optionMenuRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
  },
  optionMenuText: {
    flex: 1,
    fontSize: 19,
    lineHeight: 24,
  },
  value: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
});
