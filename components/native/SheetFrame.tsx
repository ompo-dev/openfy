import React, { type ReactNode } from 'react';
import {
  ScrollView,
  FlatList,
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
import { GlassBackdrop, GlassBackdropScope } from './GlassBackdrop';
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
  size?: 'sheet' | 'full';
  nested?: ReactNode;
  onDismiss?: () => void;
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
  size = 'sheet',
  nested,
  onDismiss,
}: SheetFrameProps) {
  const insets = useSafeAreaInsets();
  const scrollOffset = React.useRef(0);
  const hasDirectScroll = React.Children.toArray(children).some((child) =>
    React.isValidElement(child) && (child.type === ScrollView || child.type === FlatList));
  React.useEffect(() => { scrollOffset.current = scroll || hasDirectScroll ? 0 : Infinity; }, [visible, scroll, hasDirectScroll]);
  const bottomPadding = size === 'full' ? Math.max(16, insets.bottom) : 16;
  const reportScroll = (event: any) => { scrollOffset.current = event.nativeEvent.contentOffset.y; };
  // Self-scrolling lists must shrink as well as report their position for drag dismissal.
  const fittedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement<any>(child) || (child.type !== ScrollView && child.type !== FlatList)) return child;
    const element = child as React.ReactElement<any>;
    return React.cloneElement(element, {
      style: [element.props.style, { flexGrow: 0, flexShrink: 1, minHeight: 0 }],
      onScroll: (event: any) => { reportScroll(event); element.props.onScroll?.(event); },
      scrollEventThrottle: 16,
    });
  });

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
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={reportScroll}
      scrollEventThrottle={16}
    >
      {fittedChildren}
    </ScrollView>
  ) : (
    <View testID="sheet-frame-content" style={[styles.content, styles.fixedContent,
      { paddingBottom: bottomPadding }, contentHeight !== undefined && { height: contentHeight }]}>{fittedChildren}</View>
  );

  return (
    <PlayerModal
      visible={visible}
      onRequestClose={onClose}
      onDismiss={onDismiss}
      fullScreen={size === 'full'}
      scrollOffset={scrollOffset}
    >
      <GlassBackdropScope>
        <GlassBackdrop pointerEvents="none" style={StyleSheet.absoluteFill}>
          {artworkURL ? <Image source={{ uri: artworkURL }} cachePolicy="memory-disk"
            contentFit="cover" blurRadius={28} pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.artwork]} /> : null}
        </GlassBackdrop>
        <GlassSurface glass="regular" edgeEffects={false} pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: size === 'full' ? 0 : 28 }]} />
        <View testID="sheet-frame-body" style={[styles.sheet, size === 'full' && { flex: 1 }]}>
          {handle}
          {header}
          {content}
        </View>
        {nested}
      </GlassBackdropScope>
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
    paddingHorizontal: 16,
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
