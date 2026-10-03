import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
      <FullPlayer
        visible={fullPlayerVisible}
        onClose={() => setFullPlayerVisible(false)}
      />
    </>
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

  useOTAUpdates();

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
                  </View>
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
});
