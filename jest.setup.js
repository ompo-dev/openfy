const { TextDecoder, TextEncoder } = require('util');

Object.assign(global, { TextDecoder, TextEncoder });

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock(
  'expo-av',
  () => ({
    Audio: {
      setAudioModeAsync: jest.fn(),
      Sound: {
        createAsync: jest.fn().mockResolvedValue({
          sound: {
            unloadAsync: jest.fn(),
            playAsync: jest.fn(),
            pauseAsync: jest.fn(),
            setPositionAsync: jest.fn(),
            getStatusAsync: jest.fn().mockResolvedValue({
              isLoaded: true,
              isPlaying: false,
              positionMillis: 0,
              durationMillis: 10000,
            }),
          },
        }),
      },
    },
  }),
  { virtual: true }
);

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    addListener: jest.fn(),
    clearLockScreenControls: jest.fn(),
    currentStatus: { isLoaded: false, playing: false, currentTime: 0, duration: 0 },
    pause: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    setActiveForLockScreen: jest.fn(),
  })),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn().mockResolvedValue(''),
  setStringAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock_dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock_dir/audio.m4a' }),
  }),
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///mock_dir/cover.jpg' }),
  readAsStringAsync: jest.fn().mockResolvedValue('[]'),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');
  const AnimatedView = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref }, props.children)
  );
  const AnimatedScrollView = React.forwardRef((props, ref) =>
    React.createElement(ScrollView, { ...props, ref }, props.children)
  );

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      ScrollView: AnimatedScrollView,
      createAnimatedComponent: (Component) => Component,
    },
    Easing: { linear: (value) => value, out: (value) => value },
    interpolate: (value) => value,
    interpolateColor: (_value, _input, output) => output?.[0],
    useAnimatedScrollHandler: () => jest.fn(),
    useAnimatedStyle: (style) => style(),
    useSharedValue: (value) => ({ value }),
    withTiming: (value) => value,
  };
});
const matchers = require('@testing-library/react-native/matchers');

expect.extend(matchers);
