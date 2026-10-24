import React, { type ReactNode } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions, type ScrollViewProps } from 'react-native';
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

/** Gym owns presentation, insets and glass for both scroll views and virtualized lists. */
export function SheetFrame({ children, contentHeight, artworkURL: _artworkURL, closeLabel: _closeLabel,
  centerTitle = true, keyboardAwareScroll = true, size = 'full', scroll = true, renderScrollContent: customScrollContent, ...props }: SheetFrameProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A page's viewport is its parent; estimates only size fitted bottom sheets.
  const boundedHeight = size === 'full' || contentHeight === undefined ? undefined : Math.min(contentHeight,
    Math.max(120, height * 0.88 - insets.top - insets.bottom - 120));
  React.useEffect(() => {
    if (!props.visible) return;
    log.ui('modal opened', { title: props.title, size, source: 'gym-notes' });
    return () => log.ui('modal closed', { title: props.title, size, source: 'gym-notes' });
  }, [props.visible, props.title, size]);
  const childrenArray = React.Children.toArray(children);
  const list = !scroll && size === 'full' && childrenArray.length === 1 && React.isValidElement<any>(childrenArray[0]) &&
    [ScrollView, FlatList, ProgressiveFlatList].includes(childrenArray[0].type as any)
    ? childrenArray[0] as React.ReactElement<any> : null;
  const renderScrollContent = list ? (pageProps: ScrollViewProps) => React.cloneElement(list, {
    ...pageProps,
    ...list.props,
    style: [list.props.style, pageProps.style, { minHeight: 0, minWidth: 0 }],
    contentContainerStyle: [pageProps.contentContainerStyle, list.type !== ScrollView && { gap: 0 }, list.props.contentContainerStyle],
    onScroll: (event: Parameters<NonNullable<ScrollViewProps['onScroll']>>[0]) => {
      pageProps.onScroll?.(event);
      list.props.onScroll?.(event);
    },
  }) : customScrollContent;
  const content = React.Children.map(children, (child) => {
    if (!React.isValidElement<any>(child) || ![ScrollView, FlatList, ProgressiveFlatList].includes(child.type as any)) return child;
    const element = child as React.ReactElement<any>;
    return React.cloneElement(element, { style: [element.props.style,
      { flexGrow: size === 'full' || contentHeight !== undefined ? 1 : 0, flexShrink: 1, minHeight: 0 }],
      keyboardDismissMode: element.props.keyboardDismissMode ?? 'interactive' });
  });
  return <GymSheetFrame {...props} renderScrollContent={renderScrollContent} centerTitle={centerTitle} keyboardAwareScroll={keyboardAwareScroll} size={size} scroll={scroll}>
    {scroll ? content : <View testID="sheet-frame-content" style={[
      { minHeight: 0, minWidth: 0, width: '100%', flexShrink: 1 },
      size === 'full' && boundedHeight === undefined && { flex: 1 },
      boundedHeight !== undefined && { height: boundedHeight },
    ]}>{content}</View>}
  </GymSheetFrame>;
}
