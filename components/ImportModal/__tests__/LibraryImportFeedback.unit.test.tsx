import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { LibraryImportFeedback } from '../LibraryImportFeedback';
import type { ImportJob } from '../../../services/library/libraryImports';

let mockEmit: (job: ImportJob) => void;
const mockNavigate = jest.fn();
jest.mock('@hooks', () => ({ useDetailNavigation: () => ({ openDetail: mockNavigate }) }));
jest.mock('@services', () => ({ getLibraryTracks: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: { getState: () => ({ setIsFullPlayerVisible: jest.fn() }) } }));
jest.mock('../../../services/library/libraryImports', () => ({ subscribeImports: (callback: typeof mockEmit) => { mockEmit = callback; return jest.fn(); } }));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../services/background/importNotifications', () => ({ getImportDestination: () => null }));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  mockNavigate.mockClear();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const completed = (key: string) => ({ key, title: key, status: 'completed', destination: { kind: 'album', id: key } }) as ImportJob;

it('expires queued notices one at a time without discarding the next completion', async () => {
  const screen = await render(<LibraryImportFeedback />);
  await act(() => { mockEmit(completed('First')); mockEmit(completed('Second')); });
  expect(screen.getByText('First')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(6000));
  expect(screen.queryByText('First')).toBeNull();
  expect(screen.getByText('Second')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(6000));
  expect(screen.queryByText('Second')).toBeNull();
  await screen.unmount();
  jest.useRealTimers();
});

it('keeps a notice actionable before expiry and cancels its old timer when manually dismissed', async () => {
  const screen = await render(<LibraryImportFeedback />);
  await act(() => mockEmit(completed('First')));
  await act(() => jest.advanceTimersByTime(4000));
  await fireEvent.press(screen.getByLabelText('Dispensar aviso'));
  await act(() => mockEmit(completed('Second')));
  await act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByText('Second')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Abrir conteúdo adicionado'));
  expect(mockNavigate).toHaveBeenCalledWith('album', 'Second', 'library');
  expect(screen.queryByText('Second')).toBeNull();
  await screen.unmount();
  jest.useRealTimers();
});
