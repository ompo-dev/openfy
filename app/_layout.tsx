import * as React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useFonts } from 'expo-font';

import {
  AppSettingsProvider,
  DownloadProvider,
  LibrarySelectedCategoryProvider,
  PlayerProvider,
  UserDataProvider,
} from '@context';
import { MiniPlayer, FullPlayer } from '@components';
import { PlayerWidgetSync } from '../components/Player/PlayerWidgetSync';
import { GlobalConnectivity } from '../components/GlobalConnectivity/GlobalConnectivity';
import { registerBackgroundDownloadTask } from '@services';
import { useOTAUpdates } from '@hooks';
import { installErrorLogging, log } from '@utils';
import { usePlayerStore } from '../stores/usePlayerStore';
import { GlassBackdropProvider } from '../components/native/GlassBackdrop';

import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();
installErrorLogging();

function NavigationDiagnostics() {
  const pathname = usePathname();

  React.useEffect(() => {
    log.nav('route changed', { pathname });
  }, [pathname]);

  return null;
}

function PlayerOverlay() {
  const fullPlayerVisible = usePlayerStore((state) => state.isFullPlayerVisible);
  const setFullPlayerVisible = usePlayerStore((state) => state.setIsFullPlayerVisible);

  return (
    <>
      <PlayerWidgetSync />
      <MiniPlayer onPress={() => setFullPlayerVisible(true)} />
      {fullPlayerVisible ? <FullPlayer
        visible
        onClose={() => setFullPlayerVisible(false)}
      /> : null}
    </>
  );
}

function OTAUpdateOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.updateOverlay} pointerEvents="none">
      <ActivityIndicator size="large" color="#1ED760" />
      <Text style={styles.updateOverlayTitle}>Baixando atualização</Text>
      <Text style={styles.updateOverlaySubtitle}>O Openfy ficará pronto em instantes.</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'SF-Regular': require('@assets/fonts/Simply Rounded.ttf'),
    'SF-Semibold': require('@assets/fonts/Simply Rounded Bold.ttf'),
    'SF-Bold': require('@assets/fonts/Simply Rounded Bold.ttf'),
    'SF-Thin': require('@assets/fonts/Simply Rounded.ttf'),
    SimplyRounded: require('@assets/fonts/Simply Rounded.ttf'),
    'SimplyRounded-Bold': require('@assets/fonts/Simply Rounded Bold.ttf'),
    'SimplyRounded-Italic': require('@assets/fonts/Simply Rounded Italic.ttf'),
    'SimplyRounded-BoldItalic': require('@assets/fonts/Simply Rounded Bold Italic.ttf'),
  });

  const { isDownloading: isDownloadingUpdate } = useOTAUpdates();

  React.useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  React.useEffect(() => {
    log.nav('app started', { platform: Platform.OS });
    registerBackgroundDownloadTask().catch(() => {});
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <UserDataProvider>
          <LibrarySelectedCategoryProvider>
            <DownloadProvider>
              <PlayerProvider>
                <GestureHandlerRootView style={styles.gestureHandlerRootView}>
                  <GlassBackdropProvider>
                  <View style={styles.gestureHandlerRootView}>
                    <NavigationDiagnostics />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: styles.stackContent,
                      }}
                    >
                      <Stack.Screen
                        name="index"
                        options={{ headerShown: false, animation: 'fade' }}
                      />
                      <Stack.Screen
                        name="(tabs)"
                        options={{ headerShown: false, animation: 'fade' }}
                      />
                      <Stack.Screen
                        name="+not-found"
                        options={{ headerShown: false, animation: 'fade' }}
                      />
                    </Stack>
                    <PlayerOverlay />
                    <GlobalConnectivity />
                    <OTAUpdateOverlay visible={isDownloadingUpdate} />
                  </View>
                  </GlassBackdropProvider>
                  <StatusBar style="light" />
                </GestureHandlerRootView>
              </PlayerProvider>
            </DownloadProvider>
          </LibrarySelectedCategoryProvider>
        </UserDataProvider>
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gestureHandlerRootView: {
    flex: 1,
    backgroundColor: '#121212',
  },
  stackContent: {
    backgroundColor: '#121212',
  },
  updateOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
    zIndex: 100,
    gap: 12,
  },
  updateOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  updateOverlaySubtitle: {
    color: '#A8A8A8',
    fontSize: 14,
  },
});
