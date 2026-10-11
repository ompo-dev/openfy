import { AudioPlayerWeb, activePlayers } from '../../../node_modules/expo-audio/src/AudioPlayer.web';

jest.mock('../../../node_modules/expo-audio/src/AudioModule.web', () => ({ isAudioActive: () => true }));
jest.mock('../../../node_modules/expo-audio/src/AudioUtils.web', () => ({
  getAudioContext: () => mockContext, getSourceUri: (source: string) => source,
  nextId: () => 'test', preloadCache: new Map(), safeDuration: (duration: number) => duration,
  getStatusFromMedia: jest.fn(),
}));
jest.mock('../../../node_modules/expo-audio/src/MediaSessionController.web', () => ({
  mediaSessionController: { clear: jest.fn(), getActiveState: jest.fn(),
    updatePositionState: jest.fn(), updatePlaybackState: jest.fn() },
}));

const mockNodes: any[] = [];
const mockMedia: any[] = [];
const node = (kind: string) => {
  const value = { kind, connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1 },
    frequency: { value: 0 }, Q: { value: 0 }, channelCount: 2, channelCountMode: 'max', type: '' };
  mockNodes.push(value);
  return value;
};
const mockContext = { state: 'running', sampleRate: 48000, destination: {}, resume: jest.fn(),
  createMediaElementSource: jest.fn(() => node('source')), createGain: () => node('gain'),
  createBiquadFilter: () => node('filter'), createChannelSplitter: () => node('split'),
  createChannelMerger: () => node('merge') };
const source = `${window.location.origin}/audio.m4a`;

describe('patched web audio processing graph', () => {
  const originalAudio = global.Audio;
  beforeEach(() => {
    mockNodes.length = 0; mockMedia.length = 0;
    mockContext.createMediaElementSource.mockClear();
    global.Audio = jest.fn(() => {
      const media = { src: '', crossOrigin: '', currentTime: 0, playbackRate: 1, preservesPitch: false,
        load: jest.fn(), pause: jest.fn(), play: jest.fn().mockResolvedValue(undefined),
        removeAttribute: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() };
      mockMedia.push(media); return media;
    }) as any;
  });
  afterEach(() => { [...activePlayers].forEach((player) => player.remove()); global.Audio = originalAudio; });

  it('installs real filters when enabling EQ on an initially flat stereo player', async () => {
    const player = new AudioPlayerWeb(source);
    await player.setEqualizer([0.4, 0, 1000, 6, 1, 0]);
    expect(mockContext.createMediaElementSource).toHaveBeenCalledTimes(1);
    const filter = mockNodes.find((value) => value.kind === 'filter');
    expect(filter).toMatchObject({ type: 'peaking', frequency: { value: 1000 }, gain: { value: 6 }, Q: { value: 1 } });
    expect(mockNodes.some((value) => value.gain.value === 0.4)).toBe(true);
    await player.setEqualizer([1, 0]);
    expect(filter.disconnect).toHaveBeenCalled();
    expect(mockContext.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('splits and balances both channels after mono mixing', async () => {
    const player = new AudioPlayerWeb(source);
    await player.setChannelMode('mono');
    await player.setEqualizer([1, 1]);
    expect(mockNodes.some((value) => value.kind === 'gain' && value.channelCount === 1 && value.channelCountMode === 'explicit')).toBe(true);
    expect(mockNodes.some((value) => value.kind === 'split')).toBe(true);
    expect(mockNodes.some((value) => value.kind === 'gain' && value.gain.value === 0)).toBe(true);
    expect(mockNodes.some((value) => value.kind === 'merge')).toBe(true);
  });

  it('refuses a non-CORS cross-origin graph before muting the media source', async () => {
    const player = new AudioPlayerWeb('https://media.example.test/audio.m4a');
    await expect(player.setEqualizer([0.4, 0, 1000, 6, 1, 0])).rejects.toThrow('CORS');
    expect(mockContext.createMediaElementSource).not.toHaveBeenCalled();
    await expect(player.setEqualizer([1, 0])).resolves.toBeUndefined();
  });

  it('retains active registration and restores filters and pitch preservation after replacement', async () => {
    const player = new AudioPlayerWeb(source, { equalizer: [0.4, 0, 1000, 6, 1, 0] } as any);
    await player.setEqualizer([0.4, 0, 1000, 6, 1, 0]);
    player.replace(`${window.location.origin}/next.m4a`);
    expect(activePlayers.has(player)).toBe(true);
    expect(mockMedia[1].crossOrigin).toBe('anonymous');
    await player.setEqualizer([0.4, 0, 1000, 6, 1, 0]);
    player.setPlaybackRate(1.5, 'high');
    expect(mockMedia[1]).toMatchObject({ playbackRate: 1.5, preservesPitch: true });
    expect(mockContext.createMediaElementSource).toHaveBeenCalledTimes(2);
  });
});
