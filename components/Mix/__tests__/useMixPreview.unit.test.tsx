import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { renderMixAudio } from '../../../services/mix/mixAudio';
import { useMixPreview } from '../useMixPreview';
const mockPauseMain = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/audio/playerService', () => ({ pause: (...args: unknown[]) => mockPauseMain(...args) }));
jest.mock('../../../services/mix/mixAudio', () => ({ renderMixAudio: jest.fn(), downloadMixSources: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn().mockResolvedValue(undefined) }));
const project = { id: 'local_mix_preview', clips: [] } as any;
const output = { uri: 'file:///mix.m4a', durationMs: 30000 };
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(renderMixAudio).mockResolvedValue(output);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it('uses the silent-mode audio session and seeks before starting the preview, then releases it when backgrounded', async () => {
  const native = { isLoaded: true, seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }) };
  jest.mocked(createAudioPlayer).mockReturnValue(native as any);
  let background!: (state: any) => void;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = listener; return { remove: jest.fn() };
  });
  const { result, unmount } = await renderHook(useMixPreview);
  await act(async () => { await result.current.play(project, 12000); });
  expect(mockPauseMain).toHaveBeenCalledWith('mix-preview');
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: true }));
  expect(native.seekTo).toHaveBeenCalledWith(12, 0, 0);
  expect(native.seekTo.mock.invocationCallOrder[0]).toBeLessThan(native.play.mock.invocationCallOrder[0]);
  await act(async () => background('background'));
  expect(native.remove).toHaveBeenCalledTimes(1);
  expect(native.pause).toHaveBeenCalledTimes(1);
  expect(native.pause.mock.invocationCallOrder[0]).toBeLessThan(native.remove.mock.invocationCallOrder[0]);
  expect(result.current.playing).toBe(false);
  await unmount(); spy.mockRestore();
});
it('pauses and releases exactly once on unmount, including a late seek completion', async () => {
  let finishSeek!: () => void;
  const native = { isLoaded: true, seekTo: jest.fn(() => new Promise<void>((resolve) => { finishSeek = resolve; })),
    play: jest.fn(), pause: jest.fn(), remove: jest.fn(), addListener: jest.fn().mockReturnValue({ remove: jest.fn() }) };
  jest.mocked(createAudioPlayer).mockReturnValue(native as any);
  const { result, unmount } = await renderHook(useMixPreview);
  await act(async () => { await result.current.play(project, 0); });
  await unmount();
  await act(async () => { finishSeek(); });
  expect(native.pause).toHaveBeenCalledTimes(1);
  expect(native.remove).toHaveBeenCalledTimes(1);
  expect(native.play).not.toHaveBeenCalled();
});
it('never starts stale audio when the editor stops before composition completes', async () => {
  let finish!: (value: typeof output) => void;
  jest.mocked(renderMixAudio).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = await renderHook(useMixPreview);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.play(project, 0); });
  await act(async () => result.current.stop());
  await act(async () => { finish(output); await pending; });
  expect(createAudioPlayer).not.toHaveBeenCalled();
  expect(mockPauseMain).not.toHaveBeenCalled();
});
it('pauses on the next transport tap even if a stale status says the player is not playing', async () => {
  let status!: (value: any) => void;
  const native = { isLoaded: true, seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    addListener: jest.fn((_event, listener) => { status = listener; return { remove: jest.fn() }; }) };
  jest.mocked(createAudioPlayer).mockReturnValue(native as any);
  const { result } = await renderHook(useMixPreview);
  await act(async () => { await result.current.toggle(project, 0); });
  await act(async () => { status({ isLoaded: true, currentTime: 2, playing: false }); });
  expect(result.current.playing).toBe(true);
  await act(async () => { await result.current.toggle(project, 2000); });
  expect(native.pause).toHaveBeenCalledTimes(1);
  expect(native.remove).toHaveBeenCalledTimes(1);
  expect(result.current.playing).toBe(false);
  expect(result.current.position).toBe(2000);
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
});
