import * as React from 'react';

import {
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  updateAppSettings,
  type AppSettings,
} from '@services';

type AppSettingsContextValue = {
  settings: AppSettings;
  isReady: boolean;
  setSetting: <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const AppSettingsContext = React.createContext<AppSettingsContextValue | null>(
  null
);

export const AppSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = React.useState(DEFAULT_APP_SETTINGS);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAppSettings((next) => {
      if (active) setSettings(next);
    });

    void getAppSettings().then((next) => {
      if (!active) return;
      setSettings(next);
      setIsReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const setSetting = React.useCallback(
    async <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => {
      await updateAppSettings({ [key]: value });
    },
    []
  );

  const resetSettings = React.useCallback(async () => {
    await resetAppSettings();
  }, []);

  const value = React.useMemo(
    () => ({ settings, isReady, setSetting, resetSettings }),
    [isReady, resetSettings, setSetting, settings]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const value = React.useContext(AppSettingsContext);
  if (!value) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider');
  }
  return value;
};
