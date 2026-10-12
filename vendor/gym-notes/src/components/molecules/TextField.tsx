import type { Ref } from "react";
import { StyleSheet, type TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { LoggedTextInput } from "@/components/atoms/Logged";
import { Radii, Spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

// Extracted from ApiKeysSheet's ApiKeyField after copying that source file.
export function TextField({ label, hint, inputRef, style, ...props }: TextInputProps & {
  label: string; hint?: string; inputRef?: Ref<TextInput>;
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
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, lineHeight: 22 },
  apiKeyField: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  apiKeyInput: {
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    letterSpacing: 0,
  },
});
