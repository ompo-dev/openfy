const { fetchAllowedAudioStream } = require('../audioStreamProxy');

const makeResponse = (status: number, headers: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  body: {},
  headers: {
    get: (name: string) => headers[name.toLowerCase()] || null,
  },
});

describe('fetchAllowedAudioStream', () => {
  const sourceUrl = 'https://rr1.googlevideo.com/videoplayback?itag=140';
  const redirectedUrl = 'https://rr2.googlevideo.com/videoplayback?itag=140';

  it('follows an allowed redirect while preserving the requested byte range', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(302, { location: redirectedUrl }))
      .mockResolvedValueOnce(makeResponse(206, { 'content-type': 'audio/mp4' }));

    await expect(
      fetchAllowedAudioStream(new URL(sourceUrl), 'bytes=0-1023', fetchMock)
    ).resolves.toMatchObject({ status: 206 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(sourceUrl),
      expect.objectContaining({ headers: { Range: 'bytes=0-1023' }, redirect: 'manual' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(redirectedUrl),
      expect.objectContaining({ headers: { Range: 'bytes=0-1023' }, redirect: 'manual' })
    );
  });

  it('rejects redirects outside the allowed audio hosts', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(makeResponse(302, { location: 'https://example.com/audio.mp4' }));

    await expect(
      fetchAllowedAudioStream(new URL(sourceUrl), undefined, fetchMock)
    ).rejects.toThrow('Unsupported audio stream redirect');
  });
});
