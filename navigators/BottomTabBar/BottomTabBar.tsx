/** Floating three-tab GlassSurface navigation for Android and web. */
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Pages } from '@config';
import { translations } from '@data';
import { GlassSurface, LoggedPressable } from '../../components/native';

type BottomTabBarProps = any;

const TAB_META: Record<string, { icon: string; iconActive: string; label: string }> = {
  [Pages.HOME]: {
    icon: 'home-outline',
    iconActive: 'home',
    label: translations.router[Pages.HOME] ?? 'Home',
  },
  [Pages.FEED]: {
    icon: 'chatbubbles-outline',
    iconActive: 'chatbubbles',
    label: translations.router[Pages.FEED] ?? 'Feed',
  },
  [Pages.LIBRARY]: {
    icon: 'library-outline',
    iconActive: 'library',
    label: translations.router[Pages.LIBRARY] ?? 'Library',
  },
};

export const BottomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const routes = state.routes;

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

    const color = isActive ? '#0A84FF' : '#D0D0D4';

    return (
      <LoggedPressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isActive ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? meta?.label ?? route.name}
        onPress={onPress}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
      >
        {isActive ? <LinearGradient pointerEvents="none"
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.035)']}
          style={styles.selection} /> : null}
        <Ionicons
          name={((isActive ? meta?.iconActive : meta?.icon) ?? 'home') as any}
          size={22}
          color={color}
        />
        <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
          {meta?.label ?? route.name}
        </Text>
      </LoggedPressable>
    );
  };

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + 8, pointerEvents: 'box-none' }]}
    >
      <GlassSurface glass="regular" isInteractive style={styles.bar}>
        {routes.map(renderTab)}
      </GlassSurface>
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
    width: '100%',
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
    paddingHorizontal: 8,
    minWidth: 0,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'SF-Regular',
    lineHeight: 12,
    letterSpacing: 0,
  },
  selection: { ...StyleSheet.absoluteFill, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
});
