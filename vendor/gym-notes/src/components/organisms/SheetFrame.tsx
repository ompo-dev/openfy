import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, type KeyboardEvent, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { LoggedPressable } from "@/components/atoms/Logged";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  onShow?: () => void;
  children: ReactNode;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  hideDefaultClose?: boolean;
  centerTitle?: boolean;
  overlay?: ReactNode;
  /**
   * A sheet that stacks ON TOP of this one — the fridge behaviour: the parent
   * stays presented underneath while its child slides over it.
   *
   * It has to render *inside* this Modal's own view tree: RN presents a Modal
   * from `[self reactViewController]`, i.e. the closest view controller above
   * its host view. A sibling Modal resolves to the root VC, which is already
   * presenting this one, so UIKit refuses it and the child never appears.
   * Nested here, it resolves to this sheet's VC and stacks properly.
   */
  nested?: ReactNode;
  scroll?: boolean;
  keyboardAwareScroll?: boolean;
  contentBottomInset?: number;
  /** 'sheet' = glass bottom card (default), 'full' = native iOS page sheet. */
  size?: "sheet" | "full";
}

export function SheetFrame({
  visible,
  title,
  onClose,
  onDismiss,
  onShow,
  children,
  headerLeading,
  headerTrailing,
  hideDefaultClose = false,
  centerTitle = false,
  overlay,
  nested,
  scroll = true,
  keyboardAwareScroll = false,
  contentBottomInset = 0,
  size = "sheet",
}: SheetFrameProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isFull = size === "full";
  const [headerHeight, setHeaderHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const sheetRef = useRef<View>(null);
  const sheetTop = useRef(0);
  const scrollY = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => { if (visible) { dragY.setValue(0); scrollY.current = 0; } }, [visible, dragY]);
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => !isFull &&
      (gesture.y0 < sheetTop.current + 100 || (scroll && scrollY.current <= 0)) &&
      gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.4,
    onPanResponderMove: (_, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 96 || (gesture.dy > 24 && gesture.vy > 0.65)) closeRef.current();
      else Animated.spring(dragY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', damping: 24, stiffness: 260 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
  }), [dragY, isFull, scroll]);
  const scrollBottomInset = Math.max(
    contentBottomInset,
    keyboardInset > 0 ? keyboardInset + Spacing.five : 0,
  );

  useEffect(() => {
    if (!visible || !keyboardAwareScroll) {
      setKeyboardInset(0);
      return undefined;
    }

    const show = ({ endCoordinates }: KeyboardEvent) => setKeyboardInset(endCoordinates.height);
    const willShow = Keyboard.addListener("keyboardWillShow", show);
    const didShow = Keyboard.addListener("keyboardDidShow", show);
    const willHide = Keyboard.addListener("keyboardWillHide", () => setKeyboardInset(0));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      willShow.remove();
      didShow.remove();
      willHide.remove();
      hide.remove();
    };
  }, [keyboardAwareScroll, visible]);

  const handle = (
    <View style={[styles.handle, { backgroundColor: colors.border }]} />
  );

  const closeButton = (
    <LoggedPressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
    >
      <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
        <AppIcon name="x" color={colors.textSecondary} size={18} />
      </GlassSurface>
    </LoggedPressable>
  );

  const header = centerTitle ? (
    <View style={styles.centerHeader}>
      <View style={styles.headerSide}>{headerLeading}</View>
      <AppText variant="heading" numberOfLines={1} style={styles.centerTitle}>
        {title}
      </AppText>
      <View style={[styles.headerSide, styles.headerSideEnd]}>
        {headerTrailing}
        {hideDefaultClose ? null : closeButton}
      </View>
    </View>
  ) : (
    <View style={styles.header}>
      <AppText variant="heading">{title}</AppText>

      <View style={styles.actions}>
        {headerTrailing}
        {hideDefaultClose ? null : closeButton}
      </View>
    </View>
  );

  // Native iOS page sheet with a glass header that frosts content scrolling under it.
  if (isFull) {
    const page = (
        // Not a bottom-inset SafeAreaView: that left a fixed background band
        // under the scroll. The scroll fills edge to edge and the safe area is
        // folded into the content padding, so the last card clears the home
        // indicator without a dead bar below it.
        <View style={[styles.fill, { backgroundColor: colors.background }]}>
          {scroll ? (
            <ScrollView
              style={styles.fill}
              contentContainerStyle={[
                styles.contentFull,
                {
                  paddingTop: headerHeight + Spacing.four,
                  paddingBottom: Spacing.four + insets.bottom + scrollBottomInset,
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={false}
              scrollEventThrottle={16}
              onScroll={({ nativeEvent }) => {
                setScrolled(nativeEvent.contentOffset.y > 4);
              }}
            >
              {children}
            </ScrollView>
          ) : (
            // Native content (a SwiftUI Form) scrolls itself and needs bounded
            // height, so fill instead of nesting it in a ScrollView. It clears
            // the floating glass header via paddingTop.
            <View style={[styles.fill, { paddingTop: headerHeight }]}>{children}</View>
          )}

          <View
            style={styles.headerBar}
            onLayout={({ nativeEvent }) =>
              setHeaderHeight(nativeEvent.layout.height)
            }
          >
            {/* Glass only once content is behind it; keep the header tintless. */}
            {scrolled ? (
              <GlassSurface
                glass="regular"
                style={[StyleSheet.absoluteFill, styles.headerGlass]}
              />
            ) : null}
            {handle}
            {header}
          </View>
          {overlay}
          {nested}
        </View>
    );

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        testID="gym-sheet-modal"
        onRequestClose={onClose}
        onDismiss={onDismiss}
        onShow={onShow}
      >
        {page}
      </Modal>
    );
  }

  const content = scroll ? (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={[
        styles.content,
        scrollBottomInset > 0 && { paddingBottom: scrollBottomInset },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={false}
      scrollEventThrottle={16}
      onScroll={({ nativeEvent }) => { scrollY.current = nativeEvent.contentOffset.y; }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      onShow={onShow}
      testID="gym-sheet-modal"
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modal, { backgroundColor: colors.overlay }]}>
        <LoggedPressable
          testID="gym-sheet-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`${t("common.close")} tocando fora`}
        />
        <AnimatedSafeAreaView
          style={[styles.safe, { transform: [{ translateY: dragY }] }]}
          {...drag.panHandlers}
          edges={["left", "right", "bottom"]}
          pointerEvents="box-none">
          <GlassSurface glass="regular" style={styles.sheet} testID="gym-sheet-surface">
            <View ref={sheetRef} collapsable={false} onLayout={() => sheetRef.current?.measureInWindow((_, y) => { sheetTop.current = y; })} />
            {handle}
            {header}
            {content}
          </GlassSurface>
          {overlay}
        </AnimatedSafeAreaView>
        {nested}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: "flex-end",
  },
  safe: {
    // Fill the screen so the card can anchor to the bottom AND so the sheet's
    // percentage maxHeight has a definite height to resolve against. box-none in
    // the JSX lets taps on the empty area above the card fall through to the
    // backdrop that closes the sheet.
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  // The card hugs its content (flexGrow 0) but yields (flexShrink 1) once the
  // content would push the sheet past maxHeight — that is what turns on scroll
  // instead of clipping. Only the bottom-sheet mode uses this; `size="full"`
  // has its own full-height ScrollView.
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  fill: {
    flex: 1,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    overflow: "hidden",
  },
  headerGlass: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  sheet: {
    maxHeight: "88%",
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: Radii.pill,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  iconButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  centerHeader: {
    minHeight: Metrics.iconButton,
    flexDirection: "row",
    alignItems: "center",
  },
  centerTitle: {
    flex: 1,
    textAlign: "center",
  },
  headerSide: {
    minWidth: Metrics.iconButton,
    alignItems: "flex-start",
  },
  headerSideEnd: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: Spacing.two,
  },
  content: {
    flexShrink: 1,
    minHeight: 0,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  contentFull: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
});
