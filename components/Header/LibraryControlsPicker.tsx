import * as React from 'react';
import {
  Modal,
  Platform,
  ScrollView,
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
  SwiftDivider,
  SwiftHost,
  SwiftHStack,
  SwiftImage,
  SwiftMenu,
  SwiftPicker,
  SwiftText,
  GlassSurface,
  LoggedPressable,
  swiftFont,
  swiftForegroundStyle,
  swiftPickerStyle,
  swiftTag,
  glassCircleModifiers,
} from '../native';

type LibrarySort = 'recent' | 'title';
type LibraryView = 'songs' | 'playlists' | 'albums' | 'artists';
type Option<T extends string> = { label: string; value: T };

type LibraryControlsPickerProps =
  | {
      kind: 'view';
      view: LibraryView;
      onViewChange: (view: LibraryView) => void;
    }
  | {
      kind: 'filter';
      sort: LibrarySort;
      onSortChange: (sort: LibrarySort) => void;
      searchLabel: string;
      searchVisible: boolean;
      onSearchToggle: () => void;
      activeDownloadsCount: number;
      onDownloadsPress: () => void;
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

/** SwiftUI controls on iOS, with an anchored, keyboard-accessible web fallback. */
export const LibraryControlsPicker = (props: LibraryControlsPickerProps) => {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { width, height } = useWindowDimensions();
  const triggerRef = React.useRef<View>(null);
  const menuRef = React.useRef<View>(null);
  const pendingAction = React.useRef<(() => void) | null>(null);
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [anchor, setAnchor] = React.useState({ x: 12, y: 8, height: 44 });
  const [menuHeight, setMenuHeight] = React.useState(252);
  const isFilter = props.kind === 'filter';
  const label = isFilter ? 'Filtrar biblioteca' : labelFor(VIEW_OPTIONS, props.view);
  const downloadStatus = isFilter && props.activeDownloadsCount > 0
    ? `${props.activeDownloadsCount} ${props.activeDownloadsCount === 1 ? 'download' : 'downloads'} em andamento`
    : '';
  const triggerLabel = downloadStatus ? `${label}, ${downloadStatus}` : label;
  const searchLabel = isFilter
    ? props.searchVisible ? 'Ocultar pesquisa' : props.searchLabel
    : '';
  const downloadsLabel = downloadStatus
    ? `Ver downloads, ${downloadStatus}`
    : 'Ver downloads';
  const menuWidth = Math.min(260, width - 24);
  const menuLeft = Math.max(12, Math.min(anchor.x, width - menuWidth - 12));
  const menuTop = Math.max(
    8,
    Math.min(anchor.y + anchor.height + 6, height - menuHeight - 8)
  );

  const closeMenu = () => setMenuVisible(false);
  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, _width, measuredHeight) => {
      setAnchor({ x, y, height: measuredHeight });
    });
    setMenuVisible(true);
  };
  const selectAction = (action: () => void) => {
    // Let the web modal restore focus before opening search or another modal.
    if (Platform.OS === 'web') pendingAction.current = action;
    closeMenu();
    if (Platform.OS !== 'web') action();
  };
  const menuItems = () =>
    (menuRef.current as unknown as HTMLElement | null)?.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]'
    );
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const items = Array.from(menuItems() ?? []);
    const current = items.indexOf(event.target as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break;
      case 'ArrowUp': next = (current - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[next]?.focus();
  };

  if (IOS_NATIVE_ENABLED) {
    if (props.kind === 'view') {
      return (
        <SwiftHost
          style={styles.nativePickerHost}
          colorScheme={scheme}
          matchContents={{ horizontal: true, vertical: false }}
        >
          <SwiftPicker<LibraryView>
            label={<NativeMenuLabel label={label} />}
            selection={props.view}
            onSelectionChange={props.onViewChange}
            modifiers={[swiftPickerStyle?.('menu')].filter(Boolean)}
          >
            {VIEW_OPTIONS.map((option) => (
              <SwiftText key={option.value} modifiers={[swiftTag?.(option.value)].filter(Boolean)}>
                {option.label}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftHost>
      );
    }

    return (
      <SwiftHost style={styles.nativeIconHost} colorScheme={scheme}>
        <SwiftMenu
          label={triggerLabel}
          systemImage="line.3.horizontal.decrease"
          modifiers={glassCircleModifiers(44, '#B8B8B8')}
        >
          <SwiftButton
            label={searchLabel}
            systemImage={props.searchVisible ? 'xmark' : 'magnifyingglass'}
            onPress={props.onSearchToggle}
          />
          <SwiftButton
            label={downloadsLabel}
            systemImage="arrow.down.circle"
            onPress={props.onDownloadsPress}
          />
          <SwiftDivider />
          <SwiftPicker<LibrarySort>
            label="Ordenar por"
            selection={props.sort}
            onSelectionChange={props.onSortChange}
            modifiers={[swiftPickerStyle?.('inline')].filter(Boolean)}
          >
            {SORT_OPTIONS.map((option) => (
              <SwiftText key={option.value} modifiers={[swiftTag?.(option.value)].filter(Boolean)}>
                {option.label}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftMenu>
      </SwiftHost>
    );
  }

  const options = props.kind === 'filter' ? SORT_OPTIONS : VIEW_OPTIONS;
  const selectedValue = props.kind === 'filter' ? props.sort : props.view;

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={styles.triggerAnchor}>
        <GlassSurface glass="clear" isInteractive style={styles.fallbackControl}>
          <LoggedPressable
            accessibilityLabel={triggerLabel}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuVisible }}
            {...(Platform.OS === 'web' ? { 'aria-haspopup': 'menu' as const } : {})}
            onPress={openMenu}
            style={({ pressed }) => [
              styles.fallbackTrigger,
              isFilter && styles.fallbackIconTrigger,
              pressed && styles.optionRowPressed,
            ]}
          >
            {isFilter ? (
              <Ionicons name="options-outline" size={20} color="#B8B8B8" />
            ) : (
              <>
                <Text numberOfLines={1} style={styles.fallbackLabel}>{label}</Text>
                <Ionicons name="chevron-down" size={14} color="#B8B8B8" />
              </>
            )}
          </LoggedPressable>
        </GlassSurface>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        onShow={() => {
          if (Platform.OS === 'web') menuItems()?.[0]?.focus();
        }}
        onDismiss={() => {
          const action = pendingAction.current;
          pendingAction.current = null;
          action?.();
        }}
      >
        <View style={styles.menuOverlay}>
          <LoggedPressable
            accessibilityLabel="Fechar seleção"
            accessibilityRole="button"
            onPress={closeMenu}
            style={StyleSheet.absoluteFill}
          />
          <View
            ref={menuRef}
            accessibilityRole="menu"
            accessibilityLabel={label}
            accessibilityViewIsModal
            onAccessibilityEscape={closeMenu}
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            {...(Platform.OS === 'web' ? { onKeyDown: handleMenuKeyDown } : {})}
            style={[styles.optionMenu, {
              top: menuTop,
              left: menuLeft,
              width: menuWidth,
              maxHeight: height - 16,
            }]}
          >
            <GlassSurface glass="regular" tintColor="#252525" style={styles.menuSurface}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {props.kind === 'filter' ? (
                  <>
                    <MenuAction
                      label={searchLabel}
                      icon={props.searchVisible ? 'close' : 'search'}
                      onPress={() => selectAction(props.onSearchToggle)}
                    />
                    <MenuAction
                      label={downloadsLabel}
                      icon="download-outline"
                      onPress={() => selectAction(props.onDownloadsPress)}
                    />
                    <View style={styles.separator} />
                    <Text style={styles.sectionLabel}>Ordenar por</Text>
                  </>
                ) : null}
                {options.map((option) => {
                  const selected = option.value === selectedValue;
                  return (
                    <LoggedPressable
                      key={option.value}
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => selectAction(() => {
                        if (props.kind === 'filter') props.onSortChange(option.value as LibrarySort);
                        else props.onViewChange(option.value as LibraryView);
                      })}
                      style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
                    >
                      <View style={styles.checkSlot}>
                        {selected ? <Ionicons name="checkmark" size={22} color="#FFFFFF" /> : null}
                      </View>
                      <Text style={styles.optionText}>{option.label}</Text>
                    </LoggedPressable>
                  );
                })}
              </ScrollView>
            </GlassSurface>
          </View>
        </View>
      </Modal>
    </>
  );
};

const MenuAction = ({ label, icon, onPress }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}) => (
  <LoggedPressable
    accessibilityLabel={label}
    accessibilityRole="menuitem"
    onPress={onPress}
    style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
  >
    <View style={styles.checkSlot}><Ionicons name={icon} size={20} color="#FFFFFF" /></View>
    <Text style={styles.optionText}>{label}</Text>
  </LoggedPressable>
);

const NativeMenuLabel = ({ label }: { label: string }) => (
  <SwiftHStack spacing={4}>
    <SwiftText modifiers={[swiftForegroundStyle?.('#B8B8B8')].filter(Boolean)}>
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

const styles = StyleSheet.create({
  nativePickerHost: { height: 44, justifyContent: 'center', minWidth: 108, maxWidth: '100%' },
  nativeIconHost: { height: 44, justifyContent: 'center', width: 44 },
  triggerAnchor: { maxWidth: '100%' },
  fallbackControl: { alignItems: 'center', borderRadius: 22, height: 44, overflow: 'hidden' },
  fallbackTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 9,
    maxWidth: '100%',
  },
  fallbackIconTrigger: { paddingHorizontal: 0, width: 44 },
  fallbackLabel: { color: '#B8B8B8', fontFamily: 'SF-Semibold', fontSize: 12, flexShrink: 1 },
  menuOverlay: { flex: 1 },
  optionMenu: { position: 'absolute' },
  menuSurface: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 6,
    flexShrink: 1,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionRowPressed: { opacity: 0.6 },
  checkSlot: { alignItems: 'center', justifyContent: 'center', width: 26 },
  optionText: {
    color: '#FFFFFF',
    fontFamily: 'SF-Semibold',
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },
  separator: { backgroundColor: '#484848', height: StyleSheet.hairlineWidth, marginVertical: 6 },
  sectionLabel: { color: '#B8B8B8', fontFamily: 'SF-Semibold', fontSize: 12, paddingHorizontal: 16, paddingVertical: 6 },
});
