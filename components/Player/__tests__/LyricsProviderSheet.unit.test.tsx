/* eslint-disable @typescript-eslint/no-require-imports -- Hoisted factories use their own RN dependencies. */
import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LyricsProviderSheet } from '../LyricsProviderSheet';
import { probeLyricsProviders } from '../../../services/lyrics/lyricsRepository';
import { DEFAULT_APP_SETTINGS } from '../../../services/settings/appSettings';
import type { LyricsData } from '../../../services/lyrics/lyricsService';

const mockSelect = jest.fn().mockResolvedValue(undefined);
const mockPlayer = { currentTrack: { spotifyId: 'track', title: 'Song', artistName: 'Artist',
  duration_ms: 3000, albumName: 'Album', imageURL: 'cover.jpg' }, lyricsProvider: 'auto',
  lyricsProviderAttempts: { better: 'restricted', bini: 'missing' }, lyricsData: null,
  isLoadingLyrics: false, selectLyricsProvider: mockSelect };
const mockSettings = { settings: DEFAULT_APP_SETTINGS };
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: Object.assign(
  (selector: any) => selector(mockPlayer), { getState: () => mockPlayer }) }));
jest.mock('../../../stores/useAppSettingsStore', () => ({ useAppSettingsStore: (selector: any) => selector(mockSettings) }));
jest.mock('../../../stores/useConnectivityStore', () => ({ useConnectivityStore: { getState: () => ({ status: 'online' }) } }));
jest.mock('../../../services/lyrics/lyricsRepository', () => ({ probeLyricsProviders: jest.fn() }));
jest.mock('../../native', () => {
  const { View, Pressable } = require('react-native');
  return { SheetFrame: ({ visible, children }: any) => visible ? <View>{children}</View> : null,
    AppIcon: () => null, LoggedPressable: Pressable, NativeIconButton: () => null };
});
const found: LyricsData = { trackName: 'Song', artistName: 'Artist', source: 'lrclib', isSynced: true,
  segments: [{ text: 'Hello', startTimeMs: 0, endTimeMs: 3000 }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.currentTrack.spotifyId = 'track';
  mockPlayer.currentTrack.imageURL = 'cover.jpg';
  jest.mocked(probeLyricsProviders).mockImplementation(async (_query, onFound) => { onFound('lrclib', found); });
});

it('lists only successful sources, preserves automatic selection and reuses discovery on artwork changes', async () => {
  const screen = await render(<LyricsProviderSheet visible onClose={jest.fn()} />);
  expect(screen.getByLabelText('LRCLIB')).toBeTruthy();
  expect(screen.queryByLabelText('BetterLyrics')).toBeNull();
  expect(screen.queryByLabelText('BiniLyrics')).toBeNull();
  expect(mockSelect).not.toHaveBeenCalled();
  mockPlayer.currentTrack.imageURL = 'loaded.jpg';
  await screen.rerender(<LyricsProviderSheet visible onClose={jest.fn()} />);
  expect(probeLyricsProviders).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText('LRCLIB'));
  expect(mockSelect).toHaveBeenCalledWith('lrclib');
});

it('cancels availability work when the track changes or the sheet closes', async () => {
  let finish!: () => void;
  jest.mocked(probeLyricsProviders).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = await render(<LyricsProviderSheet visible onClose={jest.fn()} />);
  const firstSignal = jest.mocked(probeLyricsProviders).mock.calls[0][0].signal!;
  mockPlayer.currentTrack.spotifyId = 'next';
  await screen.rerender(<LyricsProviderSheet visible onClose={jest.fn()} />);
  expect(firstSignal.aborted).toBe(true);
  const secondSignal = jest.mocked(probeLyricsProviders).mock.calls[1][0].signal!;
  await screen.rerender(<LyricsProviderSheet visible={false} onClose={jest.fn()} />);
  expect(secondSignal.aborted).toBe(true);
  await act(async () => finish());
  expect(mockSelect).not.toHaveBeenCalled();
});
