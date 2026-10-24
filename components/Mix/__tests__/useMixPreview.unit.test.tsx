import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { renderMixAudio } from '../../../services/mix/mixAudio';
import { useMixPreview } from '../useMixPreview';
const mockPauseMain = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../stores/usePlayerStore', () => ({ usePlayerStore: { getState: () => ({
  playerState: { isPlaying: true }, togglePlayPause: mockPauseMain,
}) } }));
jest.mock('../../../services/mix/mixAudio', () => ({ renderMixAudio: jest.fn() }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn().mockResolvedValue(undefined) }));
const project = { id: 'local_mix_preview', clips: [] } as any;
const output = { uri: 'file:///mix.m4a', durationMs: 30000 };
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(renderMixAudio).mockResolvedValue(output);
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it('uses the silent-mode audio session and seeks before starting the preview, then releases it when backgrounded', async () => {
  const native = { isLoaded: true, seekTo: jest.fn().mockResolvedValue(undefined), play: jest.fn(), remove: jest.fn(),
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
  expect(result.current.playing).toBe(false);
  await unmount(); spy.mockRestore();
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
