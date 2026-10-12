import React, { type ReactNode } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetFrame as GymSheetFrame } from '../../vendor/gym-notes/src/components/organisms/SheetFrame';
import { ProgressiveFlatList } from '../common/ProgressiveList';
import { log } from '../../utils/appLogger';

type SheetFrameProps = React.ComponentProps<typeof GymSheetFrame> & {
  artworkURL?: string;
  closeLabel?: string;
  contentHeight?: number;
  children: ReactNode;
};

/** Gym owns presentation and layout; this bridge only bounds Openfy's virtualized content. */
export function SheetFrame({ children, contentHeight, artworkURL: _artworkURL, closeLabel: _closeLabel,
  centerTitle = true, keyboardAwareScroll = true, size = 'full', scroll = true, ...props }: SheetFrameProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const boundedHeight = contentHeight === undefined ? undefined : Math.min(contentHeight,
    Math.max(120, height * 0.88 - insets.top - insets.bottom - 120));
  React.useEffect(() => {
    if (!props.visible) return;
    log.ui('modal opened', { title: props.title, size, source: 'gym-notes' });
    return () => log.ui('modal closed', { title: props.title, size, source: 'gym-notes' });
  }, [props.visible, props.title, size]);
  const content = React.Children.map(children, (child) => {
    if (!React.isValidElement<any>(child) || ![ScrollView, FlatList, ProgressiveFlatList].includes(child.type as any)) return child;
    const element = child as React.ReactElement<any>;
    return React.cloneElement(element, { style: [element.props.style,
      { flexGrow: contentHeight === undefined ? 0 : 1, flexShrink: 1, minHeight: 0 }],
      keyboardDismissMode: element.props.keyboardDismissMode ?? 'interactive' });
  });
  return <GymSheetFrame {...props} centerTitle={centerTitle} keyboardAwareScroll={keyboardAwareScroll} size={size} scroll={scroll}>
    {scroll ? content : <View testID="sheet-frame-content" style={[
      { minHeight: 0, flexShrink: 1 }, size === 'full' && { flex: 1 },
      boundedHeight !== undefined && { height: boundedHeight },
    ]}>{content}</View>}
  </GymSheetFrame>;
}
