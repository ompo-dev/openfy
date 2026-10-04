import React, { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LoggedPressable } from './Logged';
import { AppIcon } from './AppIcon';
import { GlassSurface } from './GlassSurface';
import { PlayerModal } from './PlayerModal';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';

interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  hideDefaultClose?: boolean;
  scroll?: boolean;
  artworkURL?: string;
  closeLabel?: string;
  /** Preferred space for virtualized lists/editors, capped by the modal viewport. */
  contentHeight?: number;
}

export function SheetFrame({
  visible,
  title,
  onClose,
  children,
  headerLeading,
  headerTrailing,
  hideDefaultClose = false,
  scroll = true,
  artworkURL,
  closeLabel = 'Fechar',
  contentHeight,
}: SheetFrameProps) {
  const insets = useSafeAreaInsets();

  const handle = <View style={styles.handle} />;
  const closeWithFeedback = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  const closeButton = (
    <LoggedPressable
      onPress={closeWithFeedback}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={closeLabel}
    >
      <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
        <AppIcon name="close" color="#FFFFFF" size={24} />
      </GlassSurface>
    </LoggedPressable>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.headerLeading}>{headerLeading || (hideDefaultClose ? null : closeButton)}</View>
      <View style={styles.headerTitleWrap}>
        <Text numberOfLines={1} style={styles.titleText}>{title}</Text>
      </View>
      <View style={styles.actions}>
        {headerTrailing}
        {headerLeading && !hideDefaultClose ? closeButton : null}
      </View>
    </View>
  );

  const content = scroll ? (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View testID="sheet-frame-content" style={[styles.content, styles.fixedContent,
      contentHeight !== undefined && { height: contentHeight }]}>{children}</View>
  );

  return (
    <PlayerModal
      visible={visible}
      onRequestClose={onClose}
    >
      {artworkURL ? <Image source={{ uri: artworkURL }} cachePolicy="memory-disk"
        contentFit="cover" blurRadius={28} pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.artwork]} /> : null}
      <BlurView intensity={45} tint="systemUltraThinMaterialDark" pointerEvents="none" style={StyleSheet.absoluteFill} />
      <View testID="sheet-frame-body" style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
        {handle}
        {header}
        {content}
      </View>
    </PlayerModal>
  );
}

const styles = StyleSheet.create({
  artwork: { opacity: 0.64, transform: [{ scale: 1.1 }] },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheet: {
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    flexShrink: 0,
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 18,
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeading: {
    width: 40,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 8,
    gap: 16,
  },
  fixedContent: { flexShrink: 1, minHeight: 0 },
});
