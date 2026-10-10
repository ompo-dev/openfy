import * as React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ProgressiveFlatList } from '../ProgressiveList';

it('mounts library-style rows one at a time without exposing pagination early', async () => {
  jest.useFakeTimers();
  const data = Array.from({ length: 3 }, (_, index) => ({ id: String(index) }));
  const onEndReached = jest.fn();
  const view = await render(<ProgressiveFlatList testID="songs" data={data} keyExtractor={(item) => item.id}
    renderItem={({ item }) => <Text>{item.id}</Text>} onEndReached={onEndReached} />);
  expect(view.getByTestId('songs').props.data).toHaveLength(1);
  expect(view.getByTestId('songs').props.onEndReached).toBeUndefined();
  await act(async () => { jest.advanceTimersByTime(45); });
  expect(view.getByTestId('songs').props.data).toHaveLength(2);
  await act(async () => { jest.advanceTimersByTime(45); });
  expect(view.getByTestId('songs').props.data).toEqual(data);
  expect(view.getByTestId('songs').props.onEndReached).toBe(onEndReached);
  await view.unmount();
  jest.useRealTimers();
});
