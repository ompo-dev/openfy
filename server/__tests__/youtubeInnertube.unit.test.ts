import { createInnertubeTrackResolver } from '../youtubeInnertube';

describe('createInnertubeTrackResolver', () => {
  it('returns an exact playable AAC track through the YouTube iOS client', async () => {
    const getBasicInfo = jest.fn().mockResolvedValue({
      basic_info: {
        title: "God's Plan",
        author: 'Drake',
        duration: 199,
        thumbnail: [{ url: 'https://image.youtube.test/gods-plan.jpg' }],
      },
    });
    const getStreamingData = jest.fn().mockResolvedValue({
      url: 'https://rr1.googlevideo.com/videoplayback?id=m1a_GqJf02M',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const create = jest.fn().mockResolvedValue({ getBasicInfo, getStreamingData });
    const loadInnertube = jest.fn().mockResolvedValue({
      Innertube: { create },
    });
    const resolveTrack = createInnertubeTrackResolver({ loadInnertube });

    await expect(resolveTrack('m1a_GqJf02M')).resolves.toEqual({
      videoId: 'm1a_GqJf02M',
      youtubeUrl: 'https://www.youtube.com/watch?v=m1a_GqJf02M',
      streamUrl: 'https://rr1.googlevideo.com/videoplayback?id=m1a_GqJf02M',
      title: "God's Plan",
      artistName: 'Drake',
      albumName: 'Drake',
      imageURL: 'https://image.youtube.test/gods-plan.jpg',
      duration_ms: 199000,
      viewCount: 0,
      format: 'm4a',
    });
    expect(create).toHaveBeenCalledWith({
      generate_session_locally: true,
      retrieve_innertube_config: false,
      retrieve_player: false,
    });
    expect(getStreamingData).toHaveBeenCalledWith('m1a_GqJf02M', {
      client: 'IOS',
      quality: 'best',
      type: 'audio',
    });
  });

  it('rejects a response without an HTTPS audio stream', async () => {
    const create = jest.fn().mockResolvedValue({
      getBasicInfo: jest.fn().mockResolvedValue({ basic_info: { title: 'Track' } }),
      getStreamingData: jest.fn().mockResolvedValue({ url: 'file:///invalid.m4a' }),
    });
    const resolveTrack = createInnertubeTrackResolver({
      loadInnertube: jest.fn().mockResolvedValue({ Innertube: { create } }),
    });

    await expect(resolveTrack('m1a_GqJf02M')).resolves.toBeNull();
  });
});
