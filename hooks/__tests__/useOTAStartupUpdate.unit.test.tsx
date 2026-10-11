import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { getAppSettings } from '@services';
import { checkForOTAUpdateNow, type OTAUpdateCheckResult } from '../useOTAUpdates';
import { useOTAStartupUpdate } from '../useOTAStartupUpdate';

jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: 'standalone' } }));
jest.mock('expo-updates', () => ({
  isEnabled: true, checkAutomatically: 'NEVER', useUpdates: jest.fn(), reloadAsync: jest.fn(),
}));
jest.mock('@services', () => ({ getAppSettings: jest.fn() }));
jest.mock('../useOTAUpdates', () => ({ checkForOTAUpdateNow: jest.fn() }));

const nativeState = () => ({ isStartupProcedureRunning: false, isChecking: false,
  isDownloading: false, isUpdatePending: false, downloadProgress: undefined });
const setNative = (state: object) => jest.mocked(Updates.useUpdates)
  .mockReturnValue({ ...nativeState(), ...state } as ReturnType<typeof Updates.useUpdates>);
const originalDev = __DEV__;
const originalOS = Platform.OS;

describe('startup OTA screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (globalThis as any).__DEV__ = false;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    Object.defineProperty(Updates, 'checkAutomatically', { configurable: true, value: 'NEVER' });
    (AppState as any).currentState = 'active';
    setNative({});
    jest.mocked(getAppSettings).mockResolvedValue({ automaticUpdates: true } as any);
    jest.mocked(checkForOTAUpdateNow).mockResolvedValue({ status: 'window-inactive' });
    jest.mocked(Updates.reloadAsync).mockResolvedValue(undefined);
  });
  afterEach(() => {
    (globalThis as any).__DEV__ = originalDev;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits for the interface and skips inactive CI windows without restarting', async () => {
    const screen = await renderHook((ready) => useOTAStartupUpdate(ready), { initialProps: false });
    expect(checkForOTAUpdateNow).not.toHaveBeenCalled();
    await screen.rerender(true);
    expect(checkForOTAUpdateNow).toHaveBeenCalledTimes(1);
    expect(screen.result.current.phase).toBe('idle');
    expect(screen.result.current.settled).toBe(true);
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('shows real progress and paints the applying state before restarting', async () => {
    let finish!: (value: OTAUpdateCheckResult) => void;
    jest.mocked(checkForOTAUpdateNow).mockImplementation((_source, _canContinue, progress) => {
      progress?.onDownloading?.();
      return new Promise((resolve) => { finish = resolve; });
    });
    setNative({ isDownloading: true, downloadProgress: 0.42 });
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    expect(screen.result.current.phase).toBe('downloading');
    expect(screen.result.current.downloadProgress).toBe(0.42);
    await act(() => finish({ status: 'downloaded' }));
    expect(screen.result.current.phase).toBe('applying');
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not restart later if the user continues while a download is pending', async () => {
    let finish!: (value: OTAUpdateCheckResult) => void;
    jest.mocked(checkForOTAUpdateNow).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    await act(() => screen.result.current.continueToApp());
    await act(() => finish({ status: 'downloaded' }));
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(screen.result.current.phase).toBe('idle');
    expect(screen.result.current.settled).toBe(true);
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('offers retry after an OTA failure and leaves the installed app available', async () => {
    jest.mocked(checkForOTAUpdateNow).mockResolvedValueOnce({ status: 'error', stage: 'fetch' });
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    expect(screen.result.current.phase).toBe('error');
    await act(() => screen.result.current.retry());
    expect(checkForOTAUpdateNow).toHaveBeenCalledTimes(2);
    expect(screen.result.current.phase).toBe('idle');
  });

  it('does not check when automatic updates are disabled', async () => {
    jest.mocked(getAppSettings).mockResolvedValue({ automaticUpdates: false } as any);
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    expect(checkForOTAUpdateNow).not.toHaveBeenCalled();
    expect(screen.result.current.settled).toBe(true);
  });

  it('observes legacy native downloads without starting a competing request', async () => {
    Object.defineProperty(Updates, 'checkAutomatically', { configurable: true, value: 'ON_LOAD' });
    setNative({ isStartupProcedureRunning: true, isDownloading: true, downloadProgress: 0.6 });
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    expect(screen.result.current.phase).toBe('downloading');
    expect(checkForOTAUpdateNow).not.toHaveBeenCalled();
    setNative({ isUpdatePending: true });
    await screen.rerender(undefined);
    expect(screen.result.current.phase).toBe('applying');
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps a completed update for next launch if the app went to the background', async () => {
    jest.mocked(checkForOTAUpdateNow).mockResolvedValue({ status: 'downloaded' });
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    (AppState as any).currentState = 'background';
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    expect(screen.result.current.phase).toBe('idle');
  });

  it('reports reload failure instead of leaving the applying screen stuck', async () => {
    jest.mocked(checkForOTAUpdateNow).mockResolvedValue({ status: 'downloaded' });
    jest.mocked(Updates.reloadAsync).mockRejectedValue(new Error('reload failed'));
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(screen.result.current.phase).toBe('error');
  });

  it('waits for the foreground when JavaScript starts during the native launch transition', async () => {
    let listener!: (state: any) => void;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listener = callback;
      return { remove };
    });
    (AppState as any).currentState = 'inactive';
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    expect(checkForOTAUpdateNow).not.toHaveBeenCalled();
    (AppState as any).currentState = 'active';
    await act(() => listener('active'));
    expect(checkForOTAUpdateNow).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('does not restart from a late download result after unmount', async () => {
    let finish!: (value: OTAUpdateCheckResult) => void;
    jest.mocked(checkForOTAUpdateNow).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const screen = await renderHook(() => useOTAStartupUpdate(true));
    await screen.unmount();
    await act(() => finish({ status: 'downloaded' }));
    await act(() => jest.advanceTimersByTimeAsync(150));
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });
});
