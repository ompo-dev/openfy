import * as React from 'react';
import { Animated, Easing, FlatList, Platform, type FlatListProps, type ListRenderItem } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const REVEAL_INTERVAL = 45;

function ListItemEntrance({ children, animate = true, onReveal }: {
  children: React.ReactNode;
  animate?: boolean;
  onReveal?: () => number;
}) {
  const reducedMotion = useReducedMotion();
  const entrance = React.useRef({ animate, onReveal }).current;
  const progress = React.useRef(new Animated.Value(animate && !reducedMotion ? 0 : 1)).current;

  React.useEffect(() => {
    const delay = entrance.onReveal?.() ?? 0;
    if (!entrance.animate || reducedMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, progress, reducedMotion]);

  return <Animated.View style={{
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }}>{children}</Animated.View>;
}

/** Defer mounting images and rows in non-virtualized rails and short sections. */
export function ProgressiveList({ children, listKey = '' }: { children: React.ReactNode; listKey?: string }) {
  const items = React.Children.toArray(children).map((child, index) => ({
    child, key: String(React.isValidElement(child) ? child.key : index),
  }));
  const order = JSON.stringify(items.map((item) => item.key));
  const itemKeys = React.useMemo<string[]>(() => JSON.parse(order), [order]);
  const reducedMotion = useReducedMotion();
  const [reveal, setReveal] = React.useState({ key: listKey, keys: new Set(itemKeys.slice(0, 1)) });
  const visibleKeys = React.useMemo(() => {
    const retained = reveal.key === listKey ? itemKeys.filter((key) => reveal.keys.has(key)) : [];
    return new Set(retained.length ? retained : itemKeys.slice(0, 1));
  }, [itemKeys, listKey, reveal]);

  React.useEffect(() => {
    const pending = itemKeys.filter((key) => !visibleKeys.has(key));
    if (reducedMotion || !pending.length) return;
    const timer = setTimeout(() => {
      // Long result sets finish in small batches instead of waiting seconds per row.
      setReveal({ key: listKey, keys: new Set([...visibleKeys, ...pending.slice(0, visibleKeys.size < 12 ? 1 : 4)]) });
    }, REVEAL_INTERVAL);
    return () => clearTimeout(timer);
  }, [itemKeys, listKey, reducedMotion, visibleKeys]);

  return <>{items.filter(({ key }) => reducedMotion || visibleKeys.has(key)).map(({ child, key }) => (
    <ListItemEntrance key={`${listKey}:${key}`}>
      {child}
    </ListItemEntrance>
  ))}</>;
}

/** Keep the full data/queue intact; virtualization mounts cells in small, top-first batches. */
export function ProgressiveFlatList<Item>({ listKey = '', renderItem, keyExtractor, ...props }:
  FlatListProps<Item> & { listKey?: string }) {
  const reducedMotion = useReducedMotion();
  const revealed = React.useMemo(() => ({ scope: listKey, keys: new Set<string>(), nextStart: 0 }), [listKey]);
  const renderProgressiveItem = React.useCallback<ListRenderItem<Item>>((info) => {
    const key = keyExtractor?.(info.item, info.index) ?? String(info.index);
    return <ListItemEntrance key={`${revealed.scope}:${key}`} animate={!revealed.keys.has(key)}
      onReveal={() => {
        revealed.keys.add(key);
        const now = Date.now();
        // Stagger cells mounted together, but cap the delay during fast scrolling.
        const delay = Math.min(180, Math.max(0, revealed.nextStart - now));
        revealed.nextStart = now + delay + REVEAL_INTERVAL;
        return delay;
      }}>
      {renderItem?.(info)}
    </ListItemEntrance>;
  }, [keyExtractor, renderItem, revealed]);

  return <FlatList
    initialNumToRender={reducedMotion ? 10 : 4}
    maxToRenderPerBatch={reducedMotion ? 10 : 4}
    updateCellsBatchingPeriod={REVEAL_INTERVAL}
    windowSize={5}
    {...props}
    keyExtractor={keyExtractor}
    renderItem={renderProgressiveItem}
  />;
}
