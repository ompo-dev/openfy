import * as React from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getAppSettings } from '@services';
import { checkForOTAUpdateNow } from './useOTAUpdates';
import { log } from '../utils/appLogger';

export type AppUpdatePhase = 'idle' | 'checking' | 'downloading' | 'applying' | 'error';

export function useOTAStartupUpdate(ready: boolean) {
  const native = Updates.useUpdates();
  const enabled = !__DEV__ && Platform.OS !== 'web' &&
    Constants.appOwnership !== 'expo' && Updates.isEnabled;
  const controlledStartup = enabled && Updates.checkAutomatically === 'NEVER';
  const startupNativeRef = React.useRef(enabled && (
    native.isStartupProcedureRunning || native.isDownloading || native.isUpdatePending
  ));
  const [phase, setPhase] = React.useState<AppUpdatePhase>(
    controlledStartup || startupNativeRef.current ? 'checking' : 'idle'
  );
  const [settled, setSettled] = React.useState(!controlledStartup && !startupNativeRef.current);
  const [attempt, setAttempt] = React.useState(0);
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');
  const mountedRef = React.useRef(true);
  const generationRef = React.useRef(0);
  const inFlightRef = React.useRef<Promise<void> | null>(null);
  const applyingRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, []);

  const applyUpdate = React.useCallback(async (generation: number) => {
    if (!mountedRef.current || generation !== generationRef.current || applyingRef.current) return;
    applyingRef.current = true;
    setPhase('applying');
    try {
      // Let the installation state paint before the native bridge restarts JS.
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (AppState.currentState !== 'active') {
        setPhase('idle');
        setSettled(true);
        return;
      }
      await Updates.reloadAsync();
    } catch (error) {
      log.error('startup OTA reload failed', error);
      if (mountedRef.current && generation === generationRef.current) setPhase('error');
    } finally {
      applyingRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!ready || !appActive || !controlledStartup || settled || inFlightRef.current) return;
    const generation = generationRef.current;
    const canContinue = () => mountedRef.current && generation === generationRef.current &&
      AppState.currentState === 'active';
    const run = (async () => {
      try {
        const settings = await getAppSettings();
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (AppState.currentState !== 'active') {
          setPhase('idle');
          setSettled(true);
          return;
        }
        if (!settings.automaticUpdates) {
          setPhase('idle');
          setSettled(true);
          return;
        }
        setPhase('checking');
        const result = await checkForOTAUpdateNow('automatic', canContinue, {
          onDownloading: () => {
            if (canContinue()) setPhase('downloading');
          },
        });
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (result.status === 'downloaded') {
          await applyUpdate(generation);
        } else if (result.status === 'error' || result.status === 'download-failed') {
          setPhase('error');
        } else {
          setPhase('idle');
          setSettled(true);
        }
      } catch (error) {
        log.error('startup OTA check failed', error);
        if (mountedRef.current && generation === generationRef.current) setPhase('error');
      }
    })().finally(() => {
      if (inFlightRef.current === run) inFlightRef.current = null;
    });
    inFlightRef.current = run;
  }, [ready, appActive, controlledStartup, settled, attempt, applyUpdate]);

  // Older installed binaries still use native ON_LOAD. Observe that download
  // without issuing a competing check, until the next native build is installed.
  React.useEffect(() => {
    if (!ready || !appActive || controlledStartup || !startupNativeRef.current || settled) return;
    if (native.checkError || native.downloadError) {
      setPhase('error');
    } else if (native.isDownloading) {
      setPhase('downloading');
    } else if (native.isUpdatePending) {
      void applyUpdate(generationRef.current);
    } else if (!native.isStartupProcedureRunning && !native.isChecking) {
      setPhase('idle');
      setSettled(true);
    }
  }, [ready, appActive, controlledStartup, settled, native.checkError, native.downloadError,
    native.isDownloading, native.isUpdatePending, native.isStartupProcedureRunning,
    native.isChecking, applyUpdate]);

  const continueToApp = React.useCallback(() => {
    generationRef.current += 1;
    startupNativeRef.current = false;
    setPhase('idle');
    setSettled(true);
  }, []);

  const retry = React.useCallback(() => {
    if (inFlightRef.current || applyingRef.current) return;
    if (native.isUpdatePending) {
      void applyUpdate(generationRef.current);
    } else if (controlledStartup) {
      setPhase('checking');
      setSettled(false);
      setAttempt((value) => value + 1);
    } else {
      // A native launch failure can be retried through the same validated CI flow.
      setPhase('checking');
      const generation = generationRef.current;
      const run = checkForOTAUpdateNow('manual', () => generation === generationRef.current, {
        onDownloading: () => {
          if (mountedRef.current && generation === generationRef.current) setPhase('downloading');
        },
      }).then(async (result) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (result.status === 'downloaded') await applyUpdate(generation);
        else if (result.status === 'error' || result.status === 'download-failed') setPhase('error');
        else continueToApp();
      }).finally(() => { if (inFlightRef.current === run) inFlightRef.current = null; });
      inFlightRef.current = run;
    }
  }, [native.isUpdatePending, controlledStartup, applyUpdate, continueToApp]);

  return {
    phase,
    settled,
    downloadProgress: native.isDownloading ? native.downloadProgress : undefined,
    isNativeDownloading: native.isDownloading,
    continueToApp,
    retry,
  };
}
