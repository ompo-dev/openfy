import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useFonts } from 'expo-font';

import { LibrarySelectedCategoryProvider, UserDataProvider, PlayerProvider } from '@context';
import { MiniPlayer, FullPlayer } from '@components';

import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

function PlayerOverlay() {
  const [fullPlayerVisible, setFullPlayerVisible] = React.useState(false);

  return (
    <>
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
    'SimplyRounded': require('@assets/fonts/Simply Rounded.ttf'),
    'SimplyRounded-Bold': require('@assets/fonts/Simply Rounded Bold.ttf'),
    'SimplyRounded-Italic': require('@assets/fonts/Simply Rounded Italic.ttf'),
    'SimplyRounded-BoldItalic': require('@assets/fonts/Simply Rounded Bold Italic.ttf'),
  });

  React.useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <UserDataProvider>
        <LibrarySelectedCategoryProvider>
          <PlayerProvider>
            <GestureHandlerRootView style={styles.gestureHandlerRootView}>
              <View style={styles.gestureHandlerRootView}>
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
              </View>
              <StatusBar style="light" />
            </GestureHandlerRootView>
          </PlayerProvider>
        </LibrarySelectedCategoryProvider>
      </UserDataProvider>
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
