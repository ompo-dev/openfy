import * as React from 'react';
import { render } from '@testing-library/react-native';
import { TimedLyricPreview } from '../TimedLyricPreview';

it('uses word timing in the compact preview and retains text layout and ellipsis limits', async () => {
  const words = [{ text: 'Hello', startTimeMs: 1000, endTimeMs: 2000 },
    { text: 'world', startTimeMs: 2000, endTimeMs: 3000 }];
  const layout = jest.fn();
  const screen = await render(<TimedLyricPreview active words={words} positionMs={2000}
    testID="preview" numberOfLines={2} onTextLayout={layout}>Hello world</TimedLyricPreview>);
  expect(screen.getByText('Hello').props.style).toEqual({ color: '#FFFFFF' });
  expect(screen.getByText('world').props.style).toEqual({ color: 'rgba(255,255,255,0.48)' });
  expect(screen.getByTestId('preview').props.numberOfLines).toBe(2);
  expect(screen.getByTestId('preview').props.onTextLayout).toBe(layout);
  await screen.rerender(<TimedLyricPreview active={false} words={words} numberOfLines={1}>Hello world</TimedLyricPreview>);
  expect(screen.getAllByText('Hello world')).toHaveLength(1);
});
