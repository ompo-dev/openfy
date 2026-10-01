import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { log } from '../../utils/appLogger';

export const TEMPORARY_OTA_POINTER_URL =
  'https://github.com/ompo-dev/openfy/releases/download/ota-window/openfy-ota-pointer.json';

const CONFIGURED_UPDATE_URL_KEY = 'openfy_temporary_ota_url_v1';
let configuredDuringThisProcess: string | null = null;

type TemporaryOTAPointer = {
  active: boolean;
  updateUrl: string;
  runtimeVersion: string;
  expiresAt: string;
  runId: number;
};

export type TemporaryOTAResult =
  | { status: 'inactive' }
  | { status: 'ready'; runId: number; expiresAt: string }
  | { status: 'restart-required'; runId: number; expiresAt: string }
  | { status: 'incompatible'; reason: string };

type PrepareTemporaryOTAOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  pointerUrl?: string;
};

const isTemporaryUpdateUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.trycloudflare\.com$/i.test(url.hostname) &&
      url.pathname === '/api/manifest' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

const parsePointer = (value: unknown): TemporaryOTAPointer | null => {
  if (!value || typeof value !== 'object') return null;
  const pointer = value as Partial<TemporaryOTAPointer>;
  if (
    pointer.active !== true ||
    !isTemporaryUpdateUrl(pointer.updateUrl) ||
    typeof pointer.runtimeVersion !== 'string' ||
    typeof pointer.expiresAt !== 'string' ||
    !Number.isSafeInteger(pointer.runId)
  ) {
    return null;
  }
  return pointer as TemporaryOTAPointer;
};

export async function prepareTemporaryOTAUpdate(
  source: 'automatic' | 'manual',
  options: PrepareTemporaryOTAOptions = {}
): Promise<TemporaryOTAResult> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const pointerUrl = options.pointerUrl ?? TEMPORARY_OTA_POINTER_URL;
  const startedAt = now();
  const response = await fetcher(`${pointerUrl}?_=${startedAt}`, {
    headers: { 'cache-control': 'no-cache' },
  });

  if (response.status === 404 || response.status === 410) {
    return { status: 'inactive' };
  }
  if (!response.ok) {
    throw new Error(`OTA pointer request failed with HTTP ${response.status}.`);
  }

  const pointer = parsePointer(await response.json());
  const expiresAt = pointer ? Date.parse(pointer.expiresAt) : 0;
  if (
    !pointer ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now() ||
    expiresAt > now() + 12 * 60 * 1000
  ) {
    return { status: 'inactive' };
  }
  if (!['ios', 'android'].includes(Platform.OS)) {
    return { status: 'incompatible', reason: `unsupported-platform-${Platform.OS}` };
  }
  if (pointer.runtimeVersion !== Updates.runtimeVersion) {
    log.updates('temporary update does not match installed runtime', {
      source,
      pointerRuntimeVersion: pointer.runtimeVersion,
      ...updateContext(),
    });
    return { status: 'incompatible', reason: 'runtime-version-mismatch' };
  }

  const storedUrl = await AsyncStorage.getItem(CONFIGURED_UPDATE_URL_KEY);
  if (storedUrl === pointer.updateUrl && configuredDuringThisProcess !== pointer.updateUrl) {
    log.updates('temporary update endpoint already configured', {
      source,
      runId: pointer.runId,
      expiresAt: pointer.expiresAt,
      ...updateContext(),
    });
    return { status: 'ready', runId: pointer.runId, expiresAt: pointer.expiresAt };
  }

  Updates.setUpdateURLAndRequestHeadersOverride({
    updateUrl: pointer.updateUrl,
    requestHeaders: {},
  });
  configuredDuringThisProcess = pointer.updateUrl;
  await AsyncStorage.setItem(CONFIGURED_UPDATE_URL_KEY, pointer.updateUrl);
  log.updates('temporary update endpoint prepared; app restart required', {
    source,
    runId: pointer.runId,
    expiresAt: pointer.expiresAt,
    platform: Platform.OS,
    runtimeVersion: Updates.runtimeVersion,
  });
  return { status: 'restart-required', runId: pointer.runId, expiresAt: pointer.expiresAt };
}

const updateContext = () => ({
  platform: Platform.OS,
  enabled: Updates.isEnabled,
  channel: Updates.channel,
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
});
