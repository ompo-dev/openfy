import { Platform } from "react-native";

if (Platform.OS === "web") {
  void import("@/global.css");
}

export const Colors = {
  // Light mode is tuned for contrast on paper, not for looking pale. The
  // background is a warm cream so white cards lift off it (depth without a
  // border), and every accent is the DARK end of its hue — the medium yellows
  // and oranges that vanished on white are now deep amber and burnt orange that
  // actually read. Dark mode keeps the bright ends: a colour has two jobs and
  // one value cannot do both.
  light: {
    text: "#1A1714",
    textSecondary: "#5C554C",
    textTertiary: "#847B6F",
    background: "#F1EBE1",
    backgroundElement: "#E7DFD2",
    backgroundSelected: "#DAD0C0",
    surface: "#FFFFFF",
    surfaceMuted: "#F3EEE5",
    surfaceStrong: "#E9E1D4",
    border: "rgba(26,23,20,0.12)",
    overlay: "rgba(26,23,20,0.22)",
    accent: "#B87F0C",
    accentStrong: "#8C5E00",
    calories: "#E86F1D",
    carbs: "#7C3AED",
    protein: "#16A34A",
    fat: "#D99A00",
    water: "#0284C7",
    // Micronutrients. These were the same three hexes copy-pasted across the
    // goals sheet, the detail sheet and the nutrition editor — the exact kind of
    // repeated value that belongs in one place. Kept theme-neutral (identical in
    // light and dark) to match how they rendered before; tune per-theme later if
    // contrast needs it.
    sugar: "#2E9BFF",
    fiber: "#34C759",
    sodium: "#FF922E",
    danger: "#E45858",
    success: "#3BA55D",
  },
  dark: {
    text: "#F2F2F2",
    textSecondary: "#C8C8C8",
    textTertiary: "#9E9E9E",
    background: "#242424",
    backgroundElement: "#303030",
    backgroundSelected: "#3A3A3A",
    surface: "#2B2B2B",
    surfaceMuted: "#333333",
    surfaceStrong: "#404040",
    border: "rgba(255,255,255,0.09)",
    overlay: "rgba(0,0,0,0.24)",
    accent: "#F0B648",
    accentStrong: "#D69A27",
    calories: "#FF8A2A",
    carbs: "#A78BFA",
    protein: "#4ADE80",
    fat: "#FFD43B",
    water: "#38BDF8",
    sugar: "#2E9BFF",
    fiber: "#34C759",
    sodium: "#FF922E",
    danger: "#FF7A7A",
    success: "#4ADE80",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

const Poppins = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extraBold: "Poppins_800ExtraBold",
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
    regular: "system-ui",
    medium: "system-ui",
    semibold: "system-ui",
    bold: "system-ui",
    extraBold: "system-ui",
  },
  android: {
    sans: Poppins.regular,
    serif: Poppins.regular,
    rounded: Poppins.regular,
    mono: "monospace",
    ...Poppins,
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
    regular: "normal",
    medium: "normal",
    semibold: "normal",
    bold: "normal",
    extraBold: "normal",
  },
  web: {
    sans: Poppins.regular,
    serif: "var(--font-serif)",
    rounded: Poppins.regular,
    mono: "var(--font-mono)",
    ...Poppins,
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 32,
  eight: 48,
} as const;

export const Radii = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const Metrics = {
  iconButton: 44,
  /** The dock's action buttons. The shrunk totals pill is sized off this (a few
   *  px taller, see DOCK_COMPACT_H) so the keyboard row reads as one set of
   *  equal-height controls. Bump this if the buttons look off next to the bar. */
  dockButton: 48,
  control: 48,
  dock: 56,
  rowMinHeight: 56,
} as const;

export const BottomTabInset =
  Platform.select({ ios: 50, android: 105, web: 105 }) ?? 105;
export const MaxContentWidth = 800;
