import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { loadMixWaveform, loadMixRhythm, waveformSlice } from '../mixWaveform';
import { getDownloadedTrack } from '../../download/downloadManager';
import { prepareLocalAudioForPlayback } from '../../audio/localAudioRepair';
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('../../download/localAudioPaths', () => ({ getExistingLocalAudioPath: jest.fn(async (uri) => uri) }));
jest.mock('../../audio/localAudioRepair', () => ({ prepareLocalAudioForPlayback: jest.fn().mockResolvedValue(null) }));
jest.mock('../../download/downloadManager', () => ({ getDownloadedTrack: jest.fn() }));
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

it('recovers the downloaded audio from the registry and retries a failed decoder after repair', async () => {
  const peaks = Array.from({ length: 1024 }, () => 0.6);
  const decode = jest.fn().mockRejectedValueOnce(new Error('container')).mockResolvedValueOnce(peaks);
  jest.mocked(getDownloadedTrack).mockResolvedValue({ localAudioPath: 'file:///registry.m4a' } as never);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 30000, modificationTime: 1 } as never);
  jest.mocked(prepareLocalAudioForPlayback).mockResolvedValue({ uri: 'file:///repaired.m4a' } as never);
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ waveformAsync: decode } as never);
  expect(await loadMixWaveform(undefined, 'downloaded-id')).toEqual(peaks);
  expect(getDownloadedTrack).toHaveBeenCalledWith('downloaded-id');
  expect(decode.mock.calls).toEqual([['file:///registry.m4a', 1024], ['file:///repaired.m4a', 1024]]);
});
it('coalesces native three-band rhythm analysis and invalidates it on file changes', async () => {
  const uri = 'file:///rhythm.m4a';
  const bands = [0.1, 0.2, 0.3, 0.5, 0.2, 0.1];
  const rhythmAsync = jest.fn().mockResolvedValue(bands);
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ rhythmAsync } as never);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 30000, modificationTime: 1 } as never);
  expect(await Promise.all([loadMixRhythm(uri), loadMixRhythm(uri)])).toEqual([{ hopMs: 10, bands }, { hopMs: 10, bands }]);
  expect(rhythmAsync).toHaveBeenCalledTimes(1);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 30000, modificationTime: 2 } as never);
  await loadMixRhythm(uri);
  expect(rhythmAsync).toHaveBeenCalledTimes(2);
  jest.mocked(requireOptionalNativeModule).mockReturnValue({} as never);
  expect(await loadMixRhythm(uri)).toBeNull();
});
