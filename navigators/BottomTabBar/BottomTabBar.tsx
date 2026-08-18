/**
 * BottomTabBar — iOS-style floating GlassSurface pill tab bar.
 * Rendered only on Android/Web (iOS resolves NativeTabs in _layout.ios.tsx).
 * Absolutely positioned floating capsule with GlassSurface blur,
 * central import button, and SF-style tab items.
 */

import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Pages } from '@config';
import { translations } from '@data';
import { ImportModal } from '@components';
import { GlassSurface } from '../../components/native';

type BottomTabBarProps = any;

const TAB_META: Record<string, { icon: string; iconActive: string; label: string }> = {
  [Pages.HOME]: {
    icon: 'home-outline',
    iconActive: 'home',
    label: translations.router[Pages.HOME] ?? 'Home',
  },
  [Pages.LIBRARY]: {
    icon: 'library-outline',
    iconActive: 'library',
    label: translations.router[Pages.LIBRARY] ?? 'Library',
  },
};

export const BottomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const [importModalVisible, setImportModalVisible] = React.useState(false);

  const routes = state.routes;
  const midIndex = Math.ceil(routes.length / 2);
  const leftRoutes = routes.slice(0, midIndex);
  const rightRoutes = routes.slice(midIndex);

  const renderTab = (route: (typeof routes)[0]) => {
    const globalIndex = routes.indexOf(route);
    const { options } = descriptors[route.key];
    const isActive = state.index === globalIndex;
    const meta = TAB_META[route.name];

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
    };

    const color = isActive ? '#FFFFFF' : '#8E8E93';

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isActive ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons
          name={((isActive ? meta?.iconActive : meta?.icon) ?? 'home') as any}
          size={22}
          color={color}
        />
        <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
          {meta?.label ?? route.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <GlassSurface glass="regular" isInteractive style={styles.bar}>
        {leftRoutes.map(renderTab)}

        {/* Import / Add Button */}
        <Pressable
          onPress={() => setImportModalVisible(true)}
          style={({ pressed }) => [styles.importBtn, { opacity: pressed ? 0.8 : 1 }]}
          accessibilityLabel="Importar do Spotify"
        >
          <View style={styles.importBtnInner}>
            <Ionicons name="add" size={28} color="#000" />
          </View>
        </Pressable>

        {rightRoutes.map(renderTab)}
      </GlassSurface>

      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'SF-Regular',
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  importBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  importBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
});
