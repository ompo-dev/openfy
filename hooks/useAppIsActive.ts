import * as React from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

type Subscription = { remove(): void };

const isActiveState = (state: AppStateStatus | null | undefined) =>
  state !== 'background' && state !== 'inactive';

let appIsActive =
  Platform.OS === 'web' || isActiveState(AppState.currentState);
let appStateSubscription: Subscription | null = null;
const listeners = new Set<() => void>();

const updateAppState = (state: AppStateStatus) => {
  const nextIsActive = isActiveState(state);
  if (nextIsActive === appIsActive) return;

  appIsActive = nextIsActive;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  if (Platform.OS !== 'web' && !appStateSubscription) {
    appIsActive = isActiveState(AppState.currentState);
    appStateSubscription = AppState.addEventListener('change', updateAppState);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
};

const getSnapshot = () =>
  appStateSubscription
    ? appIsActive
    : Platform.OS === 'web' || isActiveState(AppState.currentState);
const getServerSnapshot = () => true;

/** Shares one AppState listener across every visual animation. */
export const useAppIsActive = () =>
  React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
