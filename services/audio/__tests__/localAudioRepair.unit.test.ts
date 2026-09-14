import { Platform } from 'react-native';
import { prepareLocalAudioForPlayback, repairLocalAudioFile } from '../localAudioRepair';

const mockRepair = jest.fn();
jest.mock('../../../modules/openfy-local-audio', () => ({
  __esModule: true, default: { repairLocalAudioAsync: (...args: unknown[]) => mockRepair(...args) },
}));

describe('local audio repair bridge', () => {
  const original = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; mockRepair.mockReset(); });
  afterEach(() => { Platform.OS = original; jest.restoreAllMocks(); });

  it('does not send remote streams or other platforms to the iOS repairer', async () => {
    expect(await repairLocalAudioFile('https://media.test/song.m4a')).toBeNull();
    Platform.OS = 'android';
    expect(await repairLocalAudioFile('file:///song.m4a')).toBeNull();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('deduplicates simultaneous requests for a downloaded file', async () => {
    let finish!: (value: object) => void;
    mockRepair.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = repairLocalAudioFile('file:///same.m4a');
    const second = repairLocalAudioFile('file:///same.m4a');
    expect(second).toBe(first);
    finish({ uri: 'file:///same.m4a', repaired: true, durationMs: 158250 });
    expect(await first).toMatchObject({ repaired: true });
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });

  it('preserves playback and permits retry after failed export validation', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRepair.mockRejectedValueOnce(new Error('validation failed')).mockResolvedValue({ repaired: false });
    await expect(prepareLocalAudioForPlayback('file:///keep.m4a')).resolves.toBeUndefined();
    await expect(repairLocalAudioFile('file:///keep.m4a')).resolves.toMatchObject({ repaired: false });
    expect(mockRepair).toHaveBeenCalledTimes(2);
  });
});
