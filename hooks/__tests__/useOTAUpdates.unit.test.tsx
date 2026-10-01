import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { checkForOTAUpdateNow } from '../useOTAUpdates';
import { prepareTemporaryOTAUpdate } from '../../services/updates/temporaryOTA';

const mockListeners = new Set<(state: string) => void>();
const mockRemove = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { appOwnership: 'standalone' },
}));

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  readLogEntriesAsync: jest.fn().mockResolvedValue([]),
  channel: 'production',
  runtimeVersion: '1.0.0',
  updateId: 'current-update',
}));

jest.mock('../../services/updates/temporaryOTA', () => ({
  prepareTemporaryOTAUpdate: jest.fn(),
}));

const flushPromises = () => act(async () => {});
const enabledOptions = (getNow: () => number) => ({
  canUseUpdates: () => true,
  getNow,
});
let useOTAUpdates: typeof import('../useOTAUpdates').useOTAUpdates;

function OTAUpdatesHarness({ getNow }: { getNow: () => number }) {
  useOTAUpdates(enabledOptions(getNow));
  return null;
}

const renderOTAUpdates = (getNow: () => number) =>
  TestRenderer.create(<OTAUpdatesHarness getNow={getNow} />);

const setAppState = async (state: 'active' | 'background' | 'inactive') => {
  (AppState as unknown as { currentState: string }).currentState = state;
  await act(async () => {
    mockListeners.forEach((listener) => listener(state));
  });
};

describe('useOTAUpdates', () => {
  let now: number;
  const originalDev = (global as typeof globalThis & { __DEV__?: boolean })
    .__DEV__;
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListeners.clear();
    mockRemove.mockClear();
    now = 1_000;
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    (AppState as unknown as { currentState: string }).currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_event, listener) => {
        mockListeners.add(listener as (state: string) => void);
        return {
          remove: () => {
            mockListeners.delete(listener as (state: string) => void);
            mockRemove();
          },
        } as ReturnType<typeof AppState.addEventListener>;
      }
    );
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({
      isAvailable: true,
    } as Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>);
    jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue({
      isNew: true,
      isRollBackToEmbedded: false,
    } as Awaited<ReturnType<typeof Updates.fetchUpdateAsync>>);
    jest.mocked(prepareTemporaryOTAUpdate).mockResolvedValue({
      status: 'ready',
      runId: 1,
      expiresAt: '2026-10-01T20:00:00.000Z',
    });
    ({ useOTAUpdates } = require('../useOTAUpdates'));
  });

  afterEach(() => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ =
      originalDev;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOS,
    });
    jest.restoreAllMocks();
  });

  it('does not duplicate the native ON_LOAD check on startup', async () => {
    act(() => {
      renderOTAUpdates(() => now);
    });

    await flushPromises();

    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('checks and fetches on warm resume after one hour without reloading', async () => {
    act(() => {
      renderOTAUpdates(() => now);
    });

    await setAppState('background');
    now += 60 * 60 * 1000;
    await setAppState('active');
    await flushPromises();

    expect(Updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('rate-limits warm resume checks for one hour', async () => {
    act(() => {
      renderOTAUpdates(() => now);
    });

    await setAppState('background');
    now += 59 * 60 * 1000;
    await setAppState('active');
    await flushPromises();

    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('deduplicates in-flight checks', async () => {
    let resolveCheck: (
      value: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>
    ) => void = () => {};
    jest.mocked(Updates.checkForUpdateAsync).mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    act(() => {
      renderOTAUpdates(() => now);
    });

    await setAppState('background');
    now += 60 * 60 * 1000;
    await setAppState('active');
    now += 60 * 60 * 1000;
    await setAppState('background');
    await setAppState('active');

    expect(Updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck({ isAvailable: true } as Awaited<
        ReturnType<typeof Updates.checkForUpdateAsync>
      >);
    });
    await flushPromises();

    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('does not fetch if the app backgrounds while checking', async () => {
    let resolveCheck: (
      value: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>
    ) => void = () => {};
    jest.mocked(Updates.checkForUpdateAsync).mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    act(() => {
      renderOTAUpdates(() => now);
    });

    await setAppState('background');
    now += 60 * 60 * 1000;
    await setAppState('active');
    await setAppState('background');
    await act(async () => {
      resolveCheck({ isAvailable: true } as Awaited<
        ReturnType<typeof Updates.checkForUpdateAsync>
      >);
    });
    await flushPromises();

    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('removes the AppState listener on unmount', () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = renderOTAUpdates(() => now);
    });

    act(() => {
      renderer?.unmount();
    });

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockListeners.size).toBe(0);
  });

  it('reports a fetch that returned no update instead of claiming success', async () => {
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({
      isAvailable: true,
      isRollBackToEmbedded: false,
    } as Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>);
    jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue({
      isNew: false,
      isRollBackToEmbedded: false,
    } as Awaited<ReturnType<typeof Updates.fetchUpdateAsync>>);

    await expect(checkForOTAUpdateNow()).resolves.toEqual({
      status: 'download-failed',
    });
  });

  it('requires a cold restart when a new temporary CI endpoint is discovered', async () => {
    jest.mocked(prepareTemporaryOTAUpdate).mockResolvedValue({
      status: 'restart-required',
      runId: 2,
      expiresAt: '2026-10-01T20:00:00.000Z',
    });

    await expect(checkForOTAUpdateNow()).resolves.toEqual({
      status: 'restart-required',
      expiresAt: '2026-10-01T20:00:00.000Z',
    });
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('does not query Expo when the temporary CI window is closed', async () => {
    jest.mocked(prepareTemporaryOTAUpdate).mockResolvedValue({ status: 'inactive' });

    await expect(checkForOTAUpdateNow()).resolves.toEqual({
      status: 'window-inactive',
    });
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('returns the native OTA failure stage and code for manual checks', async () => {
    jest.mocked(Updates.checkForUpdateAsync).mockRejectedValue(
      Object.assign(new Error('offline'), { code: 'ERR_UPDATES_CHECK' })
    );

    await expect(checkForOTAUpdateNow()).resolves.toEqual({
      status: 'error',
      stage: 'check',
      code: 'ERR_UPDATES_CHECK',
    });
    expect(Updates.readLogEntriesAsync).toHaveBeenCalled();
  });
});
