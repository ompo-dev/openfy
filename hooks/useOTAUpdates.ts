import * as React from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getAppSettings } from '@services';
import { log } from '../utils/appLogger';
import { prepareTemporaryOTAUpdate } from '../services/updates/temporaryOTA';

type UpdateCheckerOptions = {
  enabled?: boolean;
  canUseUpdates?: () => boolean;
};

export type OTAUpdateProgressHandlers = {
  onDownloading?: () => void;
  onDownloadFinished?: () => void;
};

const isExpoGo = () => Constants.appOwnership === 'expo';

const canUseUpdates = () =>
  !__DEV__ &&
  Platform.OS !== 'web' &&
  !isExpoGo() &&
  Updates.isEnabled;

export type OTAUpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'window-inactive' }
  | { status: 'restart-required'; expiresAt: string }
  | { status: 'up-to-date' }
  | { status: 'downloaded'; rollback?: boolean }
  | { status: 'download-failed' }
  | { status: 'deferred' }
  | { status: 'not-applicable'; reason: string }
  | { status: 'error'; stage: 'check' | 'fetch'; code?: string };

type UpdateError = { code?: unknown; message?: unknown };

const updateErrorDetails = (error: unknown) => {
  const value = error as UpdateError;
  return {
    code: typeof value?.code === 'string' ? value.code : undefined,
    message: error instanceof Error ? error.message : String(error),
  };
};

const updateContext = () => ({
  platform: Platform.OS,
  enabled: Updates.isEnabled,
  channel: Updates.channel,
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
});

export const checkForOTAUpdateNow = async (
  source: 'manual' | 'automatic' = 'manual',
  canContinue: () => boolean = () => true,
  progress: OTAUpdateProgressHandlers = {},
  options: { pendingOnly?: boolean } = {}
): Promise<OTAUpdateCheckResult> => {
  if (!canUseUpdates()) {
    log.updates('check unavailable in this runtime', {
      source,
      development: __DEV__,
      expoGo: isExpoGo(),
      ...updateContext(),
    });
    return { status: 'disabled' };
  }

  let stage: 'check' | 'fetch' = 'check';
  log.updates('check started', { source, ...updateContext() });

  try {
    const temporaryUpdate = await prepareTemporaryOTAUpdate(source, options);
    if (temporaryUpdate.status === 'inactive') {
      return { status: 'window-inactive' };
    }
    if (temporaryUpdate.status === 'already-installed') {
      return { status: 'up-to-date' };
    }
    if (temporaryUpdate.status === 'incompatible') {
      return { status: 'not-applicable', reason: temporaryUpdate.reason };
    }
    if (temporaryUpdate.status === 'restart-required') {
      return { status: 'restart-required', expiresAt: temporaryUpdate.expiresAt };
    }

    const update = await Updates.checkForUpdateAsync();
    log.updates('check completed', {
      source,
      available: update.isAvailable,
      rollback: update.isRollBackToEmbedded,
      reason: update.reason,
      ...updateContext(),
    });

    if (!canContinue()) {
      log.updates('fetch deferred because app is inactive', { source });
      return { status: 'deferred' };
    }

    if (!update.isAvailable && !update.isRollBackToEmbedded) {
      if (update.reason === 'noUpdateAvailableOnServer') {
        return { status: 'up-to-date' };
      }
      const reason = update.reason || 'selection-policy';
      log.updates('update not applicable to this build', { source, reason });
      return { status: 'not-applicable', reason };
    }

    stage = 'fetch';
    progress.onDownloading?.();
    let fetched: Awaited<ReturnType<typeof Updates.fetchUpdateAsync>>;
    try {
      fetched = await Updates.fetchUpdateAsync();
    } finally {
      progress.onDownloadFinished?.();
    }
    if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
      log.error('update fetch returned no installable update', {
        source,
        rollback: fetched.isRollBackToEmbedded,
        ...updateContext(),
      });
      return { status: 'download-failed' };
    }

    log.updates('update downloaded for next launch', {
      source,
      rollback: fetched.isRollBackToEmbedded,
      ...updateContext(),
    });
    return {
      status: 'downloaded',
      ...(fetched.isRollBackToEmbedded ? { rollback: true } : {}),
    };
  } catch (error) {
    const details = updateErrorDetails(error);
    const nativeLogs = await Updates.readLogEntriesAsync(15 * 60 * 1000)
      .catch(() => []);
    log.error('OTA operation failed', {
      source,
      stage,
      ...details,
      ...updateContext(),
      nativeLogs: nativeLogs.slice(-12).map((entry) => ({
        timestamp: entry.timestamp,
        level: entry.level,
        code: entry.code,
        message: entry.message,
        updateId: entry.updateId,
      })),
    });
    return {
      status: 'error',
      stage,
      ...(details.code ? { code: details.code } : {}),
    };
  }
};

export function useOTAUpdates(options: UpdateCheckerOptions = {}) {
  const [lastResult, setLastResult] = React.useState<OTAUpdateCheckResult | null>(null);
  const canCheckForUpdates = options.canUseUpdates ?? canUseUpdates;
  const pointerCheckRef = React.useRef<Promise<void> | null>(null);
  const promptedRunIdRef = React.useRef<number | null>(null);
  const activeRef = React.useRef(AppState.currentState === 'active');

  React.useEffect(() => {
    if (options.enabled === false || !canCheckForUpdates()) return;
    activeRef.current = AppState.currentState === 'active';

    const discoverTemporaryUpdate = () => {
      if (!activeRef.current || pointerCheckRef.current) return;
      const check = (async () => {
        try {
          const settings = await getAppSettings();
          if (!settings.automaticUpdates || !activeRef.current) return;
          const result = await prepareTemporaryOTAUpdate('automatic');
          if (!activeRef.current) return;
          if (
            (result.status === 'restart-required' || result.status === 'ready') &&
            promptedRunIdRef.current !== result.runId
          ) {
            promptedRunIdRef.current = result.runId;
            setLastResult({ status: 'restart-required', expiresAt: result.expiresAt });
            Alert.alert(
              'Atualização do Openfy pronta',
              'Feche o app completamente e abra novamente enquanto a janela do CI estiver ativa.'
            );
          }
        } catch (error) {
          log.error('automatic temporary OTA discovery failed', error);
        }
      })().finally(() => {
        if (pointerCheckRef.current === check) pointerCheckRef.current = null;
      });
      pointerCheckRef.current = check;
    };

    // Listen for new CI notices while the app is open, not on launch/resume.
    const pointerInterval = setInterval(discoverTemporaryUpdate, 60_000);

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        activeRef.current = nextState === 'active';
      }
    );

    return () => {
      clearInterval(pointerInterval);
      activeRef.current = false;
      subscription.remove();
    };
  }, [canCheckForUpdates, options.enabled]);

  return { isDownloading: false, lastResult };
}
