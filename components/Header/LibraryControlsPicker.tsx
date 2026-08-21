import * as React from 'react';
import { Modal, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftHost,
  SwiftHStack,
  SwiftImage,
  SwiftMenu,
  SwiftText,
  GlassSurface,
  LoggedPressable,
  swiftButtonStyle,
  swiftFont,
  swiftForegroundStyle,
} from '../native';

type LibrarySort = 'recent' | 'title';
type LibraryView = 'songs' | 'playlists' | 'albums' | 'artists';
type PickerKind = 'sort' | 'view';
type Option<T extends string> = { label: string; value: T };

type LibraryControlsPickerProps = {
  sort: LibrarySort;
  view: LibraryView;
  onSortChange: (sort: LibrarySort) => void;
  onViewChange: (view: LibraryView) => void;
};

const SORT_OPTIONS: readonly Option<LibrarySort>[] = [
  { label: 'Recentes', value: 'recent' },
  { label: 'A–Z', value: 'title' },
];

const VIEW_OPTIONS: readonly Option<LibraryView>[] = [
  { label: 'Músicas', value: 'songs' },
  { label: 'Playlists', value: 'playlists' },
  { label: 'Álbuns', value: 'albums' },
  { label: 'Artistas', value: 'artists' },
];

const labelFor = <T extends string>(options: readonly Option<T>[], value: T) =>
  options.find((option) => option.value === value)?.label ?? '';

/** SwiftUI Menu on iPhone; anchored Glass fallback used by Gym on web/Android. */
export const LibraryControlsPicker = ({
  sort,
  view,
  onSortChange,
  onViewChange,
}: LibraryControlsPickerProps) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { width } = useWindowDimensions();
  const sortRef = React.useRef<View>(null);
  const viewRef = React.useRef<View>(null);
  const [activePicker, setActivePicker] = React.useState<PickerKind | null>(null);
  const [anchor, setAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });

  const openPicker = (kind: PickerKind, ref: React.RefObject<View | null>) => {
    if (activePicker === kind) {
      setActivePicker(null);
      return;
    }
    ref.current?.measureInWindow((x, y, measuredWidth, height) => {
      setAnchor({ x, y, width: measuredWidth, height });
    });
    requestAnimationFrame(() => setActivePicker(kind));
  };

  const selectedValue = activePicker === 'sort' ? sort : view;
  const options = activePicker === 'sort' ? SORT_OPTIONS : VIEW_OPTIONS;
  const menuHeight = options.length * 48 + 12;
  const menuTop = Math.max(8, anchor.y + anchor.height - menuHeight);
  const menuRight = Math.max(12, Math.min(width - 212, width - anchor.x - anchor.width));

  if (IOS_NATIVE_ENABLED) {
    return (
      <SwiftHost
        style={styles.nativeHost}
        colorScheme={scheme}
        matchContents={{ horizontal: false, vertical: true }}
      >
        <SwiftHStack spacing={8}>
          <SwiftMenu
            modifiers={[swiftButtonStyle?.('plain')].filter(Boolean)}
            label={<NativeMenuLabel label={labelFor(SORT_OPTIONS, sort)} />}
          >
            {SORT_OPTIONS.map((option) => (
              <SwiftButton key={option.value} label={option.label} onPress={() => onSortChange(option.value)} />
            ))}
          </SwiftMenu>
          <SwiftMenu
            modifiers={[swiftButtonStyle?.('plain')].filter(Boolean)}
            label={<NativeMenuLabel label={labelFor(VIEW_OPTIONS, view)} />}
          >
            {VIEW_OPTIONS.map((option) => (
              <SwiftButton key={option.value} label={option.label} onPress={() => onViewChange(option.value)} />
            ))}
          </SwiftMenu>
        </SwiftHStack>
      </SwiftHost>
    );
  }

  return (
    <>
      <GlassSurface glass="clear" isInteractive style={styles.fallbackControls}>
        <View ref={sortRef} collapsable={false}>
          <FallbackTrigger label={labelFor(SORT_OPTIONS, sort)} onPress={() => openPicker('sort', sortRef)} />
        </View>
        <View style={styles.fallbackDivider} />
        <View ref={viewRef} collapsable={false}>
          <FallbackTrigger label={labelFor(VIEW_OPTIONS, view)} onPress={() => openPicker('view', viewRef)} />
        </View>
      </GlassSurface>

      <Modal visible={activePicker !== null} transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
        <View style={styles.menuOverlay}>
          <LoggedPressable accessibilityLabel="Fechar seleção" onPress={() => setActivePicker(null)} style={StyleSheet.absoluteFill} />
          <GlassSurface glass="regular" style={[styles.optionMenu, { top: menuTop, right: menuRight }]}>
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <LoggedPressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (activePicker === 'sort') onSortChange(option.value as LibrarySort);
                    if (activePicker === 'view') onViewChange(option.value as LibraryView);
                    setActivePicker(null);
                  }}
                  style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
                >
                  <View style={styles.checkSlot}>
                    {selected ? <Ionicons name="checkmark" size={22} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={styles.optionText}>{option.label}</Text>
                </LoggedPressable>
              );
            })}
          </GlassSurface>
        </View>
      </Modal>
    </>
  );
};

const NativeMenuLabel = ({ label }: { label: string }) => (
  <SwiftHStack spacing={4}>
    <SwiftText modifiers={[swiftForegroundStyle?.('#B8B8B8')].filter(Boolean)}>{label}</SwiftText>
    <SwiftImage
      systemName="chevron.down"
      modifiers={[swiftForegroundStyle?.('#B8B8B8'), swiftFont?.({ size: 12, weight: 'semibold' })].filter(Boolean)}
    />
  </SwiftHStack>
);

const FallbackTrigger = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <LoggedPressable
    accessibilityLabel={label}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [styles.fallbackTrigger, pressed && styles.optionRowPressed]}
  >
    <Text numberOfLines={1} style={styles.fallbackLabel}>{label}</Text>
    <Ionicons name="chevron-down" size={14} color="#B8B8B8" />
  </LoggedPressable>
);

const styles = StyleSheet.create({
  nativeHost: { height: 36, marginLeft: 'auto', minWidth: 154 },
  fallbackControls: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', height: 36, marginLeft: 'auto', overflow: 'hidden' },
  fallbackTrigger: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 36, justifyContent: 'center', paddingHorizontal: 9 },
  fallbackLabel: { color: '#B8B8B8', fontFamily: 'SF-Semibold', fontSize: 12 },
  fallbackDivider: { backgroundColor: 'rgba(255,255,255,0.14)', height: 16, width: StyleSheet.hairlineWidth },
  menuOverlay: { flex: 1 },
  optionMenu: { borderColor: 'rgba(255,255,255,0.18)', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingVertical: 6, position: 'absolute', width: 212 },
  optionRow: { alignItems: 'center', flexDirection: 'row', height: 48, paddingHorizontal: 12 },
  optionRowPressed: { opacity: 0.6 },
  checkSlot: { alignItems: 'center', justifyContent: 'center', width: 26 },
  optionText: { color: '#FFFFFF', fontFamily: 'SF-Semibold', fontSize: 15, marginLeft: 4 },
});
