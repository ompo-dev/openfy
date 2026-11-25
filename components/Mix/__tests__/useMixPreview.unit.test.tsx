import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { getDownloadedTracks } from '../../../services/download/downloadManager';
import { useMixPreview } from '../useMixPreview';
import type { MixProject } from '../../../services/mix/mixTimeline';
const mockPauseMain = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/audio/playerService', () => ({ pause: (...args: unknown[]) => mockPauseMain(...args) }));
jest.mock('../../../services/download/downloadManager', () => ({ getDownloadedTracks: jest.fn() }));
jest.mock('../../../services/download/localAudioPaths', () => ({ getExistingLocalAudioPath: jest.fn(async (path) => path || null) }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn().mockResolvedValue(undefined) }));
const project = { id: 'local_mix_preview', clips: [
  { id: 'one', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 31000, volume: 0.8 },
  { id: 'two', trackId: 'two', sourceStartMs: 0, sourceEndMs: 30000, volume: 0.4, lane: 1 },
] } as MixProject;
const player = () => ({ isLoaded: true, volume: 1, seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() }) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getDownloadedTracks).mockResolvedValue([{ spotifyId: 'one', localAudioPath: 'file:///one.m4a' }, { spotifyId: 'two', localAudioPath: 'file:///two.m4a' }] as never);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it('plays only the selected downloaded clip with its original trim and volume, without rendering a mix', async () => {
  const native = player();
  jest.mocked(createAudioPlayer).mockReturnValue(native as any);
  const { result, unmount } = await renderHook(useMixPreview);
  await act(async () => { await result.current.play(project, 12000, 'one'); });
  await waitFor(() => expect(native.play).toHaveBeenCalledTimes(1));
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///one.m4a' }, expect.any(Object));
  expect(native.seekTo).toHaveBeenCalledWith(13, 0, 0);
  expect(native.volume).toBe(0.8);
  expect(mockPauseMain).toHaveBeenCalledWith('mix-preview');
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: true }));
  await act(async () => { await result.current.toggle(project, 12000, 'one'); });
  expect(native.pause).toHaveBeenCalledTimes(1);
  expect(native.remove).toHaveBeenCalledTimes(1);
  await unmount();
});
it('plays simultaneous clips and releases both when the app backgrounds', async () => {
  const first = player(), second = player();
  jest.mocked(createAudioPlayer).mockReturnValueOnce(first as any).mockReturnValueOnce(second as any);
  let background!: (state: any) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { background = listener; return { remove: jest.fn() }; });
  const { result, unmount } = await renderHook(useMixPreview);
  await act(async () => { await result.current.play(project, 12000); });
  await waitFor(() => expect(second.play).toHaveBeenCalledTimes(1));
  expect(first.play).toHaveBeenCalledTimes(1);
  expect(first.volume).toBe(0.4); expect(second.volume).toBe(0.2);
  await act(async () => background('background'));
  for (const native of [first, second]) { expect(native.pause).toHaveBeenCalledTimes(1); expect(native.remove).toHaveBeenCalledTimes(1); }
  expect(result.current.playing).toBe(false);
  await unmount();
});
it('does not start a late seek after stopping', async () => {
  let finishSeek!: () => void;
  const native = player();
  native.seekTo.mockImplementation(() => new Promise<void>((resolve) => { finishSeek = resolve; }));
  jest.mocked(createAudioPlayer).mockReturnValue(native as any);
  const { result, unmount } = await renderHook(useMixPreview);
  await act(async () => { await result.current.play(project, 0, 'one'); });
  await waitFor(() => expect(native.seekTo).toHaveBeenCalled());
  await unmount();
  await act(async () => { finishSeek(); });
  expect(native.pause).toHaveBeenCalledTimes(1);
  expect(native.remove).toHaveBeenCalledTimes(1);
  expect(native.play).not.toHaveBeenCalled();
});
it('stops pending local file lookup without starting a player', async () => {
  let finish!: (value: any) => void;
  jest.mocked(getDownloadedTracks).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = await renderHook(useMixPreview);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.play(project, 0); });
  await act(async () => result.current.stop());
  await act(async () => { finish([]); await pending; });
  expect(createAudioPlayer).not.toHaveBeenCalled(); expect(mockPauseMain).not.toHaveBeenCalled();
});
it('stops the transport at the actual end, even with empty timeline after the audio', async () => {
  jest.useFakeTimers();
  try {
    const native = player();
    jest.mocked(createAudioPlayer).mockReturnValue(native as any);
    const { result, unmount } = await renderHook(useMixPreview);
    await act(async () => { await result.current.play(project, 29000, 'one'); });
    await act(async () => { jest.advanceTimersByTime(1040); });
    expect(result.current.position).toBe(30000); expect(result.current.playing).toBe(false);
    expect(native.remove).toHaveBeenCalledTimes(1);
    await unmount();
  } finally { jest.useRealTimers(); }
});
