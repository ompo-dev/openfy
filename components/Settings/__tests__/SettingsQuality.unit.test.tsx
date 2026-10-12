import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Settings } from '../Settings';
import { DEFAULT_APP_SETTINGS } from '../../../services/settings/appSettings';
import { useAppModalStore } from '../../gym';

const mockSave = jest.fn().mockResolvedValue(undefined);
const mockSettings = DEFAULT_APP_SETTINGS;
jest.mock('@context', () => ({ useAppSettings: () => ({ settings: mockSettings, setSetting: mockSave, resetSettings: jest.fn() }) }));
jest.mock('@hooks', () => ({ checkForOTAUpdateNow: jest.fn() }));
jest.mock('@services', () => ({
  getLibraryTracks: jest.fn().mockResolvedValue([]), getLocalPlaylists: jest.fn().mockResolvedValue([]),
  getDownloadStorageInfo: jest.fn().mockResolvedValue({ directory: '', totalBytes: 0, tracks: [] }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../../../services/audio/playerService', () => ({ getAudioCapabilities: () => ({ channels: true, quality: true }) }));
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: { getState: () => ({ currentTrack: null }) } }));
jest.mock('../AudioSettingsSheet', () => ({ AudioSettingsSheet: () => null }));
jest.mock('../LyricsSettingsSheet', () => ({ LyricsSettingsSheet: () => null }));
jest.mock('../StorageManagerModal', () => ({ StorageManagerModal: () => null, formatStorageSize: () => '0 MB' }));
jest.mock('@/components/onboarding/onboardingNative', () => jest.requireActual('@/components/onboarding/onboardingNative.ts'));
afterEach(() => { useAppModalStore.getState().closeAllAppModals(); jest.clearAllMocks(); });

it('changes streaming and download quality from inline menus without presenting another sheet', async () => {
  const screen = await render(<Settings onClose={() => {}} />);
  expect(screen.getAllByTestId('gym-sheet-modal')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Qualidade do streaming'));
  expect(screen.getAllByTestId('gym-sheet-modal')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Economia'));
  expect(mockSave).toHaveBeenCalledWith('streamingQuality', 'economy');
  expect(screen.queryByLabelText('Economia')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Qualidade dos downloads'));
  await fireEvent.press(screen.getByLabelText('Alta'));
  expect(mockSave).toHaveBeenCalledWith('downloadQuality', 'high');
  expect(screen.getAllByTestId('gym-sheet-modal')).toHaveLength(1);
});

it('automatically clears a transient settings notice', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
  const screen = await render(<Settings onClose={() => {}} />);
  await fireEvent.press(screen.getByLabelText('Limpar logs'));
  expect(screen.getByText('Logs da sessão limpos.')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(6000));
  expect(screen.queryByText('Logs da sessão limpos.')).toBeNull();
  await screen.unmount();
  jest.useRealTimers();
});
