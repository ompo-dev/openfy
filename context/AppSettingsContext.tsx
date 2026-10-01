import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { AppSettings } from '../services/settings/appSettings';
import {
  initializeAppSettingsStore,
  useAppSettingsStore,
} from '../stores/useAppSettingsStore';

type AppSettingsContextValue = {
  settings: AppSettings;
  isReady: boolean;
  setSetting: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
};

export const AppSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  React.useEffect(() => {
    void initializeAppSettingsStore();
  }, []);

  return <>{children}</>;
};

export const useAppSettings = (): AppSettingsContextValue =>
  useAppSettingsStore(useShallow((state) => ({
    settings: state.settings,
    isReady: state.isReady,
    setSetting: state.setSetting,
    resetSettings: state.resetSettings,
  })));
