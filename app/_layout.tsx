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
import { PlayerMediaSuggestionsSync } from '../components/Player/PlayerMediaSuggestionsSync';
import { GlobalConnectivity } from '../components/GlobalConnectivity/GlobalConnectivity';
import { LibraryImportFeedback } from '../components/ImportModal/LibraryImportFeedback';
import { registerBackgroundDownloadTask } from '@services';
import { useOTAUpdates } from '@hooks';
import { installErrorLogging, log } from '@utils';
import { usePlayerStore } from '../stores/usePlayerStore';
import { GlassBackdropProvider } from '../components/native/GlassBackdrop';
import { useFollowedArtistsStore } from '../stores/useFollowedArtistsStore';
import { prefetchArtistData } from '../services/library/artistProfilePrefetch';
import { prefetchImage } from '../services/images/imagePrefetch';
import { rememberDetailPreview } from '../services/navigation/detailPreview';
import { rememberCachedArtistImage } from '../services/library/artistImageCache';
import { useConnectivityStore } from '../stores/useConnectivityStore';
import { useOTAStartupUpdate } from '../hooks/useOTAStartupUpdate';
import { AppUpdateScreen } from '../components/Updates/AppUpdateScreen';

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

function FollowedArtistsWarmup() {
  const artists = useFollowedArtistsStore((state) => state.artists);
  const offline = useConnectivityStore((state) => state.status === 'offline');
  React.useEffect(() => {
    if (offline) return;
    artists.slice(0, 6).forEach((artist) => {
      rememberDetailPreview('artist', artist.id, { title: artist.name, imageURL: artist.imageURL });
      if (artist.imageURL) void prefetchImage(artist.imageURL).catch(() => {});
      if (artist.imageURL) void rememberCachedArtistImage(artist.name, artist.imageURL, [artist.id]);
    });
    prefetchArtistData(artists.slice(0, 6));
  }, [artists, offline]);
  return null;
}

function PlayerOverlay() {
  const fullPlayerVisible = usePlayerStore((state) => state.isFullPlayerVisible);
  const setFullPlayerVisible = usePlayerStore((state) => state.setIsFullPlayerVisible);
  const miniArtworkRef = React.useRef<View>(null);

  return (
    <>
      <PlayerWidgetSync />
      <PlayerMediaSuggestionsSync />
      <MiniPlayer
        animateToFullPlayer
        artworkViewRef={miniArtworkRef}
        artworkHidden={fullPlayerVisible}
        onPress={() => setFullPlayerVisible(true)}
      />
      {fullPlayerVisible ? <FullPlayer
        visible
        miniArtworkRef={miniArtworkRef}
        onClose={() => setFullPlayerVisible(false)}
      /> : null}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'SF-Regular': require('@assets/fonts/SF-Pro-Display-Regular.otf'),
    'SF-Semibold': require('@assets/fonts/SF-Pro-Display-Semibold.otf'),
    'SF-Bold': require('@assets/fonts/SF-Pro-Display-Semibold.otf'),
    'SF-Thin': require('@assets/fonts/SF-Pro-Display-Thin.otf'),
    SimplyRounded: require('@assets/fonts/SF-Pro-Display-Regular.otf'),
    'SimplyRounded-Bold': require('@assets/fonts/SF-Pro-Display-Semibold.otf'),
    'SimplyRounded-Italic': require('@assets/fonts/SF-Pro-Display-Regular.otf'),
    'SimplyRounded-BoldItalic': require('@assets/fonts/SF-Pro-Display-Semibold.otf'),
  });

  const interfaceReady = fontsLoaded || !!fontError;
  const startupUpdate = useOTAStartupUpdate(interfaceReady);
  const { isDownloading: isDownloadingUpdate } = useOTAUpdates({ enabled: startupUpdate.settled });
  const [updateDismissed, setUpdateDismissed] = React.useState(false);
  const backgroundDownload = isDownloadingUpdate || startupUpdate.isNativeDownloading;
  React.useEffect(() => {
    if (!backgroundDownload) setUpdateDismissed(false);
  }, [backgroundDownload]);
  const updatePhase = startupUpdate.phase !== 'idle' ? startupUpdate.phase
    : backgroundDownload && !updateDismissed ? 'downloading' : 'idle';

  React.useEffect(() => {
    if (interfaceReady) {
      SplashScreen.hideAsync();
    }
  }, [interfaceReady]);

  React.useEffect(() => {
    log.nav('app started', { platform: Platform.OS });
    registerBackgroundDownloadTask().catch(() => {});
    void useFollowedArtistsStore.getState().hydrate().catch((error) => {
      log.error('load followed artists failed', { error: String(error) });
    });
  }, []);

  if (!interfaceReady) {
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
                    <FollowedArtistsWarmup />
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
                    <LibraryImportFeedback />
                    <AppUpdateScreen phase={updatePhase} progress={startupUpdate.downloadProgress}
                      onRetry={startupUpdate.phase === 'error' ? startupUpdate.retry : undefined}
                      onContinue={() => {
                        setUpdateDismissed(true);
                        startupUpdate.continueToApp();
                      }} />
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
});
