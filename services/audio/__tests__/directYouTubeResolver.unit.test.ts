const mockCreate = jest.fn();

jest.mock('youtubei.js', () => ({
  Innertube: {
    create: mockCreate,
  },
}));

import {
  resetDirectYouTubeResolverForTests,
  resolveDirectYouTubeAudio,
  resolveDirectYouTubeTrack,
} from '../directYouTubeResolver';

describe('resolveDirectYouTubeAudio', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    resetDirectYouTubeResolverForTests();
  });

  it('resolves an exact YouTube video through the iOS streaming client', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    mockCreate.mockResolvedValue({ getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({ videoId: 'V1M1hYxmRvA' })
    ).resolves.toEqual({
      videoId: 'V1M1hYxmRvA',
      url: 'https://media.youtube.test/mafinoso.m4a',
      format: 'm4a',
    });
    expect(getStreamingData).toHaveBeenCalledWith('V1M1hYxmRvA', {
      client: 'IOS',
      quality: 'best',
      type: 'audio',
    });
  });

  it('searches and accepts only a canonical title, artist, and duration match', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const search = jest.fn().mockResolvedValue({
      videos: [
        {
          video_id: 'V1M1hYxmRvA',
          title: { toString: () => 'Mafioso' },
          author: { name: 'ÉoDan' },
          duration: { seconds: 237 },
          best_thumbnail: { url: 'https://image.youtube.test/mafinoso.jpg' },
        },
        {
          video_id: 'wrong-video',
          title: { toString: () => 'Outra Música' },
          author: { name: 'Outro Artista' },
          duration: { seconds: 237 },
        },
      ],
    });
    mockCreate.mockResolvedValue({ search, getStreamingData });

    await expect(
      resolveDirectYouTubeAudio({
        title: 'Mafioso',
        artist: 'ÉoDan',
        durationMs: 237_000,
      })
    ).resolves.toMatchObject({
      videoId: 'V1M1hYxmRvA',
      imageURL: 'https://image.youtube.test/mafinoso.jpg',
      url: 'https://media.youtube.test/mafinoso.m4a',
    });
    expect(search).toHaveBeenCalledWith('ÉoDan - Mafioso Official Audio', {
      type: 'video',
    });
  });

  it('loads exact pasted video metadata and audio on device', async () => {
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://media.youtube.test/mafinoso.m4a',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const getBasicInfo = jest.fn().mockResolvedValue({
      basic_info: {
        title: 'Mafioso',
        author: 'ÉoDan - Topic',
        duration: 236,
        thumbnail: [{ url: 'https://image.youtube.test/mafinoso.jpg' }],
      },
    });
    mockCreate.mockResolvedValue({ getBasicInfo, getStreamingData });

    await expect(resolveDirectYouTubeTrack('V1M1hYxmRvA')).resolves.toEqual({
      videoId: 'V1M1hYxmRvA',
      title: 'Mafioso',
      artistName: 'ÉoDan - Topic',
      durationMs: 236000,
      imageURL: 'https://image.youtube.test/mafinoso.jpg',
      url: 'https://media.youtube.test/mafinoso.m4a',
      format: 'm4a',
    });
  });
});
