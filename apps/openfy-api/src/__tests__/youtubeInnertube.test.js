const { describe, expect, it } = require('bun:test');
const { createInnertubeTrackResolver } = require('../youtubeInnertube');

describe('createInnertubeTrackResolver', () => {
  it('returns an exact playable AAC stream through the YouTube iOS client', async () => {
    let basicInfoOptions;
    const getBasicInfo = async (_, options) => {
      basicInfoOptions = options;
      return {
        basic_info: {
          title: "God's Plan",
          author: 'Drake',
          duration: 199,
          thumbnail: [{ url: 'https://image.youtube.test/gods-plan.jpg' }],
        },
      };
    };
    const getStreamingData = async () => ({
      url: 'https://rr1.googlevideo.com/videoplayback?id=m1a_GqJf02M',
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    });
    const resolveTrack = createInnertubeTrackResolver({
      loadInnertube: async () => ({
        Innertube: {
          create: async () => ({ getBasicInfo, getStreamingData }),
        },
      }),
    });

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
    expect(basicInfoOptions).toBeUndefined();
  });

  it('keeps a valid iOS stream when metadata is unavailable', async () => {
    const resolveTrack = createInnertubeTrackResolver({
      loadInnertube: async () => ({
        Innertube: {
          create: async () => ({
            getBasicInfo: async () => {
              throw new Error('metadata blocked');
            },
            getStreamingData: async () => ({
              url: 'https://rr1.googlevideo.com/videoplayback?id=m1a_GqJf02M',
              mime_type: 'audio/mp4; codecs="mp4a.40.2"',
            }),
          }),
        },
      }),
    });

    await expect(resolveTrack('m1a_GqJf02M')).resolves.toMatchObject({
      videoId: 'm1a_GqJf02M',
      streamUrl: 'https://rr1.googlevideo.com/videoplayback?id=m1a_GqJf02M',
      title: 'YouTube Audio',
      format: 'm4a',
    });
  });
});
