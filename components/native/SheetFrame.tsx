import React, { type ReactNode, useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  type KeyboardEvent,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoggedPressable } from './Logged';
import { AppIcon } from './AppIcon';
import { GlassSurface } from './GlassSurface';

interface SheetFrameProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  hideDefaultClose?: boolean;
  scroll?: boolean;
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
}: SheetFrameProps) {
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }
    const show = ({ endCoordinates }: KeyboardEvent) =>
      setKeyboardInset(endCoordinates.height);
    const willShow = Keyboard.addListener('keyboardWillShow', show);
    const willHide = Keyboard.addListener('keyboardWillHide', () =>
      setKeyboardInset(0)
    );
    return () => {
      willShow.remove();
      willHide.remove();
    };
  }, [visible]);

  const handle = <View style={styles.handle} />;

  const closeButton = (
    <LoggedPressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Fechar"
    >
      <GlassSurface glass="regular" isInteractive style={styles.iconButton}>
        <AppIcon name="close" color="#FFFFFF" size={18} />
      </GlassSurface>
    </LoggedPressable>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.headerLeading}>{headerLeading}</View>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.titleText}>{title}</Text>
      </View>
      <View style={styles.actions}>
        {headerTrailing}
        {hideDefaultClose ? null : closeButton}
      </View>
    </View>
  );

  const content = scroll ? (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={[
        styles.content,
        keyboardInset > 0 && { paddingBottom: keyboardInset + 20 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
    >
      <View style={styles.modalBackdrop}>
        <LoggedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <SafeAreaView
          style={styles.safe}
          edges={['left', 'right', 'bottom']}
          pointerEvents="box-none"
        >
          <GlassSurface glass="regular" style={styles.sheet}>
            {handle}
            {header}
            {content}
          </GlassSurface>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  safe: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheet: {
    maxHeight: '90%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(20, 20, 26, 0.82)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeading: {
    minWidth: 36,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 8,
    gap: 16,
  },
});
