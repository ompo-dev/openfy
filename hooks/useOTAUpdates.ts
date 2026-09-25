import * as React from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getAppSettings } from '@services';

const MIN_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type UpdateCheckerOptions = {
  canUseUpdates?: () => boolean;
  getNow?: () => number;
};

const isExpoGo = () => Constants.appOwnership === 'expo';

const canUseUpdates = () =>
  !__DEV__ &&
  Platform.OS !== 'web' &&
  !isExpoGo() &&
  Updates.isEnabled;

export type OTAUpdateCheckResult =
  | 'disabled'
  | 'up-to-date'
  | 'downloaded'
  | 'error';

export const checkForOTAUpdateNow = async (): Promise<OTAUpdateCheckResult> => {
  if (!canUseUpdates()) return 'disabled';

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) return 'up-to-date';
    await Updates.fetchUpdateAsync();
    return 'downloaded';
  } catch {
    return 'error';
  }
};

export function useOTAUpdates(options: UpdateCheckerOptions = {}) {
  const canCheckForUpdates = options.canUseUpdates ?? canUseUpdates;
  const getNow = options.getNow ?? Date.now;
  const lastCheckAtRef = React.useRef(getNow());
  const inFlightRef = React.useRef<Promise<void> | null>(null);
  const activeRef = React.useRef(AppState.currentState === 'active');

  React.useEffect(() => {
    if (!canCheckForUpdates()) return;

    const runUpdateCheck = () => {
      const now = getNow();
      if (now - lastCheckAtRef.current < MIN_UPDATE_CHECK_INTERVAL_MS) return;
      if (inFlightRef.current) return;

      lastCheckAtRef.current = now;
      const check = (async () => {
        try {
          const settings = await getAppSettings();
          if (!settings.automaticUpdates || !activeRef.current) return;
          const update = await Updates.checkForUpdateAsync();
          if (!update.isAvailable || !activeRef.current) return;
          if (AppState.currentState !== 'active') return;

          await Updates.fetchUpdateAsync();
        } catch {
          // Updates are opportunistic. Offline or service failures should not
          // disturb playback, downloads, edits, or startup.
        }
      })().finally(() => {
        if (inFlightRef.current === check) {
          inFlightRef.current = null;
        }
      });

      inFlightRef.current = check;
    };

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        activeRef.current = nextState === 'active';
        if (nextState === 'active') {
          runUpdateCheck();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [canCheckForUpdates, getNow]);
}
