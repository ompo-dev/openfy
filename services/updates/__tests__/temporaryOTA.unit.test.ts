import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { prepareTemporaryOTAUpdate } from '../temporaryOTA';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('expo-updates', () => ({
  isEnabled: true,
  channel: null,
  runtimeVersion: '1.0.2',
  updateId: 'embedded-update',
  setUpdateURLAndRequestHeadersOverride: jest.fn(),
}));

describe('prepareTemporaryOTAUpdate', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  it('configures a live CI tunnel and marks the app restart as required', async () => {
    const updateUrl = 'https://openfy-ci.trycloudflare.com/api/manifest';
    const fetcher = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        active: true,
        updateUrl,
        runtimeVersion: '1.0.2',
        runId: 123,
        expiresAt: '2026-10-01T12:10:05.000Z',
      }),
    });

    await expect(
      prepareTemporaryOTAUpdate('manual', {
        fetcher,
        now: () => now,
        pointerUrl: 'https://github.com/ompo-dev/openfy/ota-pointer.json',
      })
    ).resolves.toEqual({
      status: 'restart-required',
      runId: 123,
      expiresAt: '2026-10-01T12:10:05.000Z',
    });
    expect(Updates.setUpdateURLAndRequestHeadersOverride).toHaveBeenCalledWith({
      updateUrl,
      requestHeaders: {},
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'openfy_temporary_ota_url_v1',
      updateUrl
    );
  });

  it('rejects a tunnel for a different runtime and does not change native settings', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        active: true,
        updateUrl: 'https://openfy-ci.trycloudflare.com/api/manifest',
        runtimeVersion: '9.9.9',
        runId: 124,
        expiresAt: '2026-10-01T12:10:05.000Z',
      }),
    });

    await expect(
      prepareTemporaryOTAUpdate('manual', { fetcher, now: () => now })
    ).resolves.toEqual({
      status: 'incompatible',
      reason: 'runtime-version-mismatch',
    });
    expect(Updates.setUpdateURLAndRequestHeadersOverride).not.toHaveBeenCalled();
  });

  it('ignores expired and non-HTTPS pointers', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          active: true,
          updateUrl: 'https://expired.trycloudflare.com/api/manifest',
          runtimeVersion: '1.0.2',
          runId: 125,
          expiresAt: '2026-10-01T11:59:59.000Z',
        }),
      })
      .mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        active: true,
        updateUrl: 'http://openfy-ci.trycloudflare.com/api/manifest',
        runtimeVersion: '1.0.2',
        runId: 125,
        expiresAt: '2026-10-01T12:10:05.000Z',
      }),
      });

    await expect(
      prepareTemporaryOTAUpdate('manual', { fetcher, now: () => now })
    ).resolves.toEqual({ status: 'inactive' });
    await expect(
      prepareTemporaryOTAUpdate('manual', { fetcher, now: () => now })
    ).resolves.toEqual({ status: 'inactive' });
    expect(Updates.setUpdateURLAndRequestHeadersOverride).not.toHaveBeenCalled();
  });
});
