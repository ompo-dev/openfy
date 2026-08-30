jest.mock('@config', () => ({
  LOCAL_AUDIO_ONLY: true,
  MUSIC_SERVER_URL: '',
}));

jest.mock('../directYouTubeResolver', () => ({
  resolveDirectYouTubeAudio: jest.fn(),
  getDirectYouTubeMediaHeaders: jest.fn().mockReturnValue(null),
}));

import { getPlayableAudioUrl, resolveAudioUrl } from '../audioResolver';
import { resolveDirectYouTubeAudio } from '../directYouTubeResolver';

const directYouTubeMock = resolveDirectYouTubeAudio as jest.Mock;

describe('standalone native audio resolution', () => {
  beforeEach(() => {
    directYouTubeMock.mockReset();
    global.fetch = jest.fn();
  });

  it('keeps the device stream direct and never asks a Metro server', async () => {
    directYouTubeMock.mockResolvedValue({
      videoId: 'V1M1hYxmRvA',
      url: 'https://media.youtube.test/mafinoso.m4a',
      format: 'm4a',
    });

    await expect(
      resolveAudioUrl('Mafioso', 'ÉoDan', 'spotify_id', 237000)
    ).resolves.toMatchObject({
      source: 'youtube',
      url: 'https://media.youtube.test/mafinoso.m4a',
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(getPlayableAudioUrl('https://media.youtube.test/mafinoso.m4a')).toBe(
      'https://media.youtube.test/mafinoso.m4a'
    );
  });
});
