jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          unloadAsync: jest.fn(),
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          setPositionAsync: jest.fn(),
          getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false, positionMillis: 0, durationMillis: 10000 }),
        },
      }),
    },
  },
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn().mockResolvedValue(''),
  setStringAsync: jest.fn(),
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
