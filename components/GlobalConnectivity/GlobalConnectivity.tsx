import * as React from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ImportModal } from '../ImportModal';
import { findMediaLinkInText } from '../../services/spotify/linkParser';
import { useConnectivityStore } from '../../stores/useConnectivityStore';

export function GlobalConnectivity() {
  const insets = useSafeAreaInsets();
  const status = useConnectivityStore((state) => state.status);
  const offlineToastVersion = useConnectivityStore(
    (state) => state.offlineToastVersion
  );
  const updateConnectivity = useConnectivityStore(
    (state) => state.updateConnectivity
  );
  const showOfflineToast = useConnectivityStore(
    (state) => state.showOfflineToast
  );
  const [importLink, setImportLink] = React.useState<string | undefined>();
  const [isImportVisible, setImportVisible] = React.useState(false);
  const lastOpenedLink = React.useRef<string | null>(null);

  React.useEffect(() => {
    let active = true;
    let checking = false;
    const checkInternet = async () => {
      if (!active || checking) return;
      checking = true;
      if (Platform.OS === 'web') {
        updateConnectivity(typeof navigator !== 'undefined' && navigator.onLine);
        checking = false;
        return;
      }

      const controller = typeof AbortController === 'undefined'
        ? undefined
        : new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 4500);
      try {
        const response = await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: controller?.signal,
        });
        updateConnectivity(response.ok);
      } catch {
        updateConnectivity(false);
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    };

    void checkInternet();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void checkInternet();
    }, 25_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkInternet();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [updateConnectivity]);

  React.useEffect(() => {
    if (status === 'offline') showOfflineToast();
  }, [status, showOfflineToast]);

  React.useEffect(() => {
    if (!offlineToastVersion) return;
    const timer = setTimeout(() => {
      useConnectivityStore.setState((state) =>
        state.offlineToastVersion === offlineToastVersion
          ? { offlineToastVersion: 0 }
          : state
      );
    }, 4200);
    return () => clearTimeout(timer);
  }, [offlineToastVersion]);

  React.useEffect(() => {
    let active = true;
    const inspectClipboard = async () => {
      try {
        const link = findMediaLinkInText(await Clipboard.getStringAsync());
        if (!active || !link || link === lastOpenedLink.current) return;
        lastOpenedLink.current = link;
        setImportLink(link);
        setImportVisible(true);
      } catch {
        // Clipboard access is optional; manual import remains available.
      }
    };

    void inspectClipboard();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void inspectClipboard();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <>
      <ImportModal
        visible={isImportVisible}
        initialInput={importLink}
        onClose={() => setImportVisible(false)}
      />
      {offlineToastVersion > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={[styles.toast, { bottom: insets.bottom + 118 }]}
        >
          <Ionicons name="cloud-offline-outline" size={19} color="#FFF" />
          <Text style={styles.toastText}>
            Você está offline. Só músicas baixadas podem ser reproduzidas.
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(42, 42, 44, 0.96)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    maxWidth: '92%',
    paddingHorizontal: 18,
    paddingVertical: 13,
    position: 'absolute',
    zIndex: 1000,
  },
  toastText: {
    color: '#FFF',
    flexShrink: 1,
    fontFamily: 'SF-Semibold',
    fontSize: 13,
  },
});
