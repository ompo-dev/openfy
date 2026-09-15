import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

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
    jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue(
      {} as Awaited<ReturnType<typeof Updates.fetchUpdateAsync>>
    );
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
});
