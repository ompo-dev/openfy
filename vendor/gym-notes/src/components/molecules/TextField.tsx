import type { ReactNode, Ref } from "react";
import { StyleSheet, type TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { LoggedTextInput } from "@/components/atoms/Logged";
import { Radii, Spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

// Extracted from ApiKeysSheet's ApiKeyField after copying that source file.
export function TextField({ label, hint, inputRef, trailing, style, ...props }: TextInputProps & {
  label: string; hint?: string; inputRef?: Ref<TextInput>; trailing?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.apiKeyField}>
      <AppText variant="body" numberOfLines={1} style={styles.label}>{label}</AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textTertiary}>
          {hint}
        </AppText>
      ) : null}
      <View testID="gym-text-field-input-row" style={styles.inputRow}>
      <LoggedTextInput
        {...props}
        ref={inputRef}
        label={label}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.textTertiary}
        autoCorrect={props.autoCorrect ?? false}
        style={[
          styles.apiKeyInput,
          { backgroundColor: colors.surfaceMuted, color: colors.text },
          style,
        ]}
      />
      {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, lineHeight: 22 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 0 },
  apiKeyField: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  apiKeyInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    letterSpacing: 0,
  },
});
