import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DEFAULT_APP_SETTINGS } from '../../../services/settings/appSettings';
import { LyricsSettingsSheet } from '../LyricsSettingsSheet';

const mockSave = jest.fn();
const mockDrag = jest.fn();
const mockSettings = { ...DEFAULT_APP_SETTINGS, lyricsSourceOrder: ['better', 'lrclib', 'bini'] };
jest.mock('../../../stores/useAppSettingsStore', () => ({ useAppSettingsStore: () => ({ settings: mockSettings, setSetting: mockSave }) }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: require('react-native').View,
  Gesture: { Pan: () => ({ activateAfterLongPress: () => ({}) }) },
}));
jest.mock('react-native-reorderable-list', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  return { NestedReorderableList: ({ data, renderItem, ...props }: any) => <View {...props} data={data}>
    {data.map((item: string, index: number) => <React.Fragment key={item}>{renderItem({ item, index })}</React.Fragment>)}
    </View>, ScrollViewContainer: ScrollView, useReorderableDrag: () => mockDrag,
    reorderItems: (data: string[], from: number, to: number) => { const next = [...data]; next.splice(to, 0, next.splice(from, 1)[0]); return next; } };
});
jest.mock('@/components/onboarding/onboardingNative', () => jest.requireActual('@/components/onboarding/onboardingNative.ts'));

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.lyricsSourceOrder = ['better', 'lrclib', 'bini'];
  mockSave.mockImplementation(async (key, value) => { (mockSettings as any)[key] = typeof value === 'function' ? value((mockSettings as any)[key]) : value; });
});

it('starts dragging on a hold, persists the drop order and retains provider toggles', async () => {
  const screen = await render(<LyricsSettingsSheet visible onClose={() => {}} />);
  expect(screen.queryByLabelText('Aumentar prioridade de better')).toBeNull();
  await fireEvent(screen.getByLabelText('Reordenar BetterLyrics'), 'longPress');
  expect(mockDrag).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByTestId('lyrics-priority-list'), 'reorder', { from: 0, to: 2 });
  expect(mockSave).toHaveBeenCalledWith('lyricsSourceOrder', ['lrclib', 'bini', 'better']);
  await fireEvent(screen.getByLabelText('Ativar bini'), 'valueChange', false);
  expect(mockSettings.lyricsDisabledSources).toContain('bini');
});

it('moves immediately, rolls back a failed save and supports VoiceOver reorder actions', async () => {
  let reject!: (reason: Error) => void;
  mockSave.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const screen = await render(<LyricsSettingsSheet visible onClose={() => {}} />);
  await fireEvent(screen.getByTestId('lyrics-priority-list'), 'reorder', { from: 0, to: 1 });
  expect(screen.getByTestId('lyrics-priority-list').props.data).toEqual(['lrclib', 'better', 'bini']);
  expect(screen.getByTestId('lyrics-priority-list').props.dragEnabled).toBe(false);
  await act(async () => reject(new Error('storage')));
  expect(screen.getByTestId('lyrics-priority-list').props.data).toEqual(['better', 'lrclib', 'bini']);
  expect(screen.getByText('Nao foi possivel salvar a prioridade.')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Reordenar BetterLyrics'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(mockSave).toHaveBeenLastCalledWith('lyricsSourceOrder', ['lrclib', 'better', 'bini']);
});
