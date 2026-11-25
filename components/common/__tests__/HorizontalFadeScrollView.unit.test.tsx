import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { HorizontalFadeScrollView, horizontalScrollEdges, transparentColor } from '../HorizontalFadeScrollView';

describe('horizontal scroll edge fades', () => {
  it('only fades edges with hidden content, including elastic overscroll and non-overflowing content', () => {
    expect(horizontalScrollEdges(0, 100, 90)).toEqual({ left: false, right: false });
    expect(horizontalScrollEdges(0, 100, 300)).toEqual({ left: false, right: true });
    expect(horizontalScrollEdges(50, 100, 300)).toEqual({ left: true, right: true });
    expect(horizontalScrollEdges(200, 100, 300)).toEqual({ left: true, right: false });
    expect(horizontalScrollEdges(-12, 100, 300)).toEqual({ left: false, right: true });
    expect(horizontalScrollEdges(230, 100, 300)).toEqual({ left: true, right: false });
  });

  it('uses the actual RGB color at zero alpha rather than a black transparent stop', () => {
    expect(transparentColor('#282828')).toBe('rgba(40,40,40,0)');
    expect(transparentColor('#AC5420')).toBe('rgba(172,84,32,0)');
  });

  it('updates each edge and keeps existing scroll events and content sizing callbacks', async () => {
    const onScroll = jest.fn(), onLayout = jest.fn(), onContentSizeChange = jest.fn();
    const ref = React.createRef<ScrollView>();
    const screen = await render(<HorizontalFadeScrollView ref={ref} testID="rail" fadeColor="#282828" fadeWidth={12}
      onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange}><Text>Contents</Text></HorizontalFadeScrollView>);
    const rail = screen.getByTestId('rail');
    await fireEvent(rail, 'layout', { nativeEvent: { layout: { width: 100, height: 40, x: 0, y: 0 } } });
    await fireEvent(rail, 'contentSizeChange', 300, 40);
    expect(screen.queryByTestId('horizontal-fade-left')).toBeNull();
    expect(screen.getByTestId('horizontal-fade-right')).toBeTruthy();
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onContentSizeChange).toHaveBeenCalledWith(300, 40);
    const scroll = (x: number) => fireEvent.scroll(rail, { nativeEvent: { contentOffset: { x, y: 0 }, layoutMeasurement: { width: 100, height: 40 }, contentSize: { width: 300, height: 40 } } });
    await scroll(50);
    expect(screen.getByTestId('horizontal-fade-left')).toBeTruthy();
    expect(screen.getByTestId('horizontal-fade-right')).toBeTruthy();
    expect(onScroll).toHaveBeenCalledTimes(1);
    await scroll(200);
    expect(screen.getByTestId('horizontal-fade-left')).toBeTruthy();
    expect(screen.queryByTestId('horizontal-fade-right')).toBeNull();
    await fireEvent(rail, 'contentSizeChange', 80, 40);
    expect(screen.queryByTestId('horizontal-fade-left')).toBeNull();
    expect(screen.queryByTestId('horizontal-fade-right')).toBeNull();
    expect(screen.getByText('Contents')).toBeTruthy();
  });
});
