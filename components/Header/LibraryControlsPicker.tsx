import * as React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
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
  glassCircleModifiers,
} from '../native';

type LibrarySort = 'recent' | 'title';
type LibraryView = 'songs' | 'playlists' | 'albums' | 'artists';
type LibraryControlKind = 'sort' | 'view';
type Option<T extends string> = { label: string; value: T };

type LibraryControlsPickerProps = {
  kind: LibraryControlKind;
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
  kind,
  sort,
  view,
  onSortChange,
  onViewChange,
}: LibraryControlsPickerProps) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { width } = useWindowDimensions();
  const triggerRef = React.useRef<View>(null);
  const [activePicker, setActivePicker] =
    React.useState<LibraryControlKind | null>(null);
  const [anchor, setAnchor] = React.useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const openPicker = () => {
    if (activePicker === kind) {
      setActivePicker(null);
      return;
    }
    triggerRef.current?.measureInWindow((x, y, measuredWidth, height) => {
      setAnchor({ x, y, width: measuredWidth, height });
    });
    requestAnimationFrame(() => setActivePicker(kind));
  };

  const isSort = kind === 'sort';
  const selectedValue = isSort ? sort : view;
  const options = isSort ? SORT_OPTIONS : VIEW_OPTIONS;
  const label = isSort
    ? labelFor(SORT_OPTIONS, sort)
    : labelFor(VIEW_OPTIONS, view);
  const menuHeight = options.length * 48 + 12;
  const menuTop = Math.max(8, anchor.y + anchor.height - menuHeight);
  const menuRight = Math.max(
    12,
    Math.min(width - 212, width - anchor.x - anchor.width)
  );

  if (IOS_NATIVE_ENABLED) {
    return (
      <SwiftHost
        style={isSort ? styles.nativeIconHost : styles.nativeHost}
        colorScheme={scheme}
        matchContents={{ horizontal: !isSort, vertical: false }}
      >
        <SwiftMenu
          {...(isSort
            ? { label: 'Ordenar', systemImage: 'line.3.horizontal.decrease' }
            : { label: <NativeMenuLabel label={label} /> })}
          modifiers={
            isSort
              ? glassCircleModifiers(38, '#B8B8B8')
              : [swiftButtonStyle?.('plain')].filter(Boolean)
          }
        >
          {options.map((option) => (
            <SwiftButton
              key={option.value}
              label={option.label}
              onPress={() =>
                isSort
                  ? onSortChange(option.value as LibrarySort)
                  : onViewChange(option.value as LibraryView)
              }
            />
          ))}
        </SwiftMenu>
      </SwiftHost>
    );
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <GlassSurface
          glass="clear"
          isInteractive
          style={styles.fallbackControl}
        >
          <FallbackTrigger
            iconOnly={isSort}
            label={label}
            onPress={openPicker}
          />
        </GlassSurface>
      </View>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.menuOverlay}>
          <LoggedPressable
            accessibilityLabel="Fechar seleção"
            onPress={() => setActivePicker(null)}
            style={StyleSheet.absoluteFill}
          />
          <GlassSurface
            glass="regular"
            style={[styles.optionMenu, { top: menuTop, right: menuRight }]}
          >
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <LoggedPressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (isSort) onSortChange(option.value as LibrarySort);
                    else onViewChange(option.value as LibraryView);
                    setActivePicker(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <View style={styles.checkSlot}>
                    {selected ? (
                      <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                    ) : null}
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

const NativeMenuLabel = ({
  label,
}: {
  label: string;
}) =>
  (
    <SwiftHStack spacing={4}>
      <SwiftText
        modifiers={[swiftForegroundStyle?.('#B8B8B8')].filter(Boolean)}
      >
        {label}
      </SwiftText>
      <SwiftImage
        systemName="chevron.down"
        modifiers={[
          swiftForegroundStyle?.('#B8B8B8'),
          swiftFont?.({ size: 12, weight: 'semibold' }),
        ].filter(Boolean)}
      />
    </SwiftHStack>
  );

const FallbackTrigger = ({
  iconOnly,
  label,
  onPress,
}: {
  iconOnly: boolean;
  label: string;
  onPress: () => void;
}) => (
  <LoggedPressable
    accessibilityLabel={label}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [
      styles.fallbackTrigger,
      iconOnly && styles.fallbackIconTrigger,
      pressed && styles.optionRowPressed,
    ]}
  >
    {iconOnly ? (
      <Ionicons name="options-outline" size={18} color="#B8B8B8" />
    ) : (
      <>
        <Text numberOfLines={1} style={styles.fallbackLabel}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color="#B8B8B8" />
      </>
    )}
  </LoggedPressable>
);

const styles = StyleSheet.create({
  nativeHost: { height: 38, justifyContent: 'center' },
  nativeIconHost: { height: 38, justifyContent: 'center', width: 38 },
  fallbackControl: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    overflow: 'hidden',
  },
  fallbackTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  fallbackIconTrigger: { paddingHorizontal: 0, width: 36 },
  fallbackLabel: { color: '#B8B8B8', fontFamily: 'SF-Semibold', fontSize: 12 },
  menuOverlay: { flex: 1 },
  optionMenu: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 6,
    position: 'absolute',
    width: 212,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 48,
    paddingHorizontal: 12,
  },
  optionRowPressed: { opacity: 0.6 },
  checkSlot: { alignItems: 'center', justifyContent: 'center', width: 26 },
  optionText: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 15,
    marginLeft: 4,
  },
});
