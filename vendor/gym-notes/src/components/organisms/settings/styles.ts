import { StyleSheet } from "react-native";

import { Metrics, Radii, Spacing } from "@/constants/theme";

/** Cross-cutting settings styles: used by the root page and three or more sheets. */
export const settingsStyles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.6,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontSize: 14,
    marginLeft: Spacing.four,
  },
  summaryIcon: {
    width: 26,
    alignItems: "center",
  },
  bold: {
    fontWeight: "700",
  },
  flexText: {
    flex: 1,
    minWidth: 0,
  },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  primaryAction: {
    minHeight: 58,
    borderRadius: Radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  chartCard: {
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    overflow: "hidden",
  },
  emptySavedMeals: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.five,
  },
});

/**
 * Row/list language shared by the three saved-* sheets (meals, exercises,
 * routines). The `savedMeal` prefix is historical — meals came first.
 */
export const savedListStyles = StyleSheet.create({
  savedMealConfirm: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealContent: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  savedMealHeaderButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealName: {
    flex: 1,
    minWidth: 0,
  },
  savedMealRow: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  savedMealSelectIcon: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
