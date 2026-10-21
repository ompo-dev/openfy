import * as React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ProgressiveFlatList, ProgressiveList } from '../ProgressiveList';

afterEach(() => jest.useRealTimers());

it('reveals incoming separators before retained Home sections without hiding old content', async () => {
  jest.useFakeTimers();
  const list = (keys: string[]) => <ProgressiveList preserveOrder listKey="home">
    {keys.map((key) => <Text accessibilityRole="header" key={key}>{key}</Text>)}
  </ProgressiveList>;
  const view = await render(list(['release1', 'release2', 'release3']));
  expect(view.getAllByRole('header').map((node) => node.props.children)).toEqual(['release1']);
  await act(async () => { jest.advanceTimersByTime(45); });
  await act(async () => { jest.advanceTimersByTime(45); });
  await view.rerender(list(['release1', 'spotlight', 'release2', 'artists', 'release3', 'discovery']));
  expect(view.getAllByRole('header').map((node) => node.props.children)).toEqual([
    'release1', 'spotlight', 'release2', 'artists', 'release3',
  ]);
  expect(view.queryByText('discovery')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(45); });
  expect(view.getByText('discovery')).toBeTruthy();
  await view.rerender(<ProgressiveList preserveOrder listKey="another-home"><Text>Reset</Text><Text>Next</Text></ProgressiveList>);
  expect(view.getByText('Reset')).toBeTruthy();
  expect(view.queryByText('Next')).toBeNull();
  await view.unmount();
  jest.useRealTimers();
});

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
