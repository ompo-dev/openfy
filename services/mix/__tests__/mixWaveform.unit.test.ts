import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { loadMixWaveform, waveformSlice } from '../mixWaveform';
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('../../download/localAudioPaths', () => ({ getExistingLocalAudioPath: jest.fn(async (uri) => uri) }));
jest.mock('../../audio/localAudioRepair', () => ({ prepareLocalAudioForPlayback: jest.fn().mockResolvedValue(null) }));
it('draws only peaks belonging to the selected source range', () => {
  expect(waveformSlice([0.1, 0.2, 0.8, 0.9], 0, 2000, 4000, 2)).toEqual([0.1, 0.2]);
  expect(waveformSlice([0.1, 0.2, 0.8, 0.9], 2000, 4000, 4000, 2)).toEqual([0.8, 0.9]);
  expect(waveformSlice([], 0, 1000, 4000, 2)).toEqual([]);
});
it('reuses the real persisted waveform, deduplicates decoding and invalidates changed audio', async () => {
  const uri = 'file:///downloaded.m4a';
  const peaks = Array.from({ length: 1024 }, () => 0.4);
  const key = JSON.stringify([uri, 20000, 1]);
  await AsyncStorage.setItem('openfy_mix_waveforms_v1', JSON.stringify([[key, peaks]]));
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 20000, modificationTime: 1 } as never);
  const decode = jest.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.8));
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ waveformAsync: decode } as never);
  expect(await loadMixWaveform(uri)).toEqual(peaks);
  expect(decode).not.toHaveBeenCalled();
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 20000, modificationTime: 2 } as never);
  const results = await Promise.all([loadMixWaveform(uri), loadMixWaveform(uri)]);
  expect(results[0][0]).toBe(0.8);
  expect(results[0]).toEqual(results[1]);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await AsyncStorage.getItem('openfy_mix_waveforms_v1'))!)).toEqual(expect.arrayContaining([
    [JSON.stringify([uri, 20000, 2]), results[0]],
  ]));
});
