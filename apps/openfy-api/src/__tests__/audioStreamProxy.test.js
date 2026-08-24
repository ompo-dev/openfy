import { describe, expect, it } from 'bun:test';

const { fetchAllowedAudioStream } = require('../audioStreamProxy');

const audioResponse = () =>
  new Response('audio', {
    status: 206,
    headers: { 'content-type': 'audio/mp4', 'content-range': 'bytes 0-4/5' },
  });

describe('fetchAllowedAudioStream', () => {
  it('preserves the browser Range header for Googlevideo', async () => {
    const fetchImpl = async (url, options) => {
      expect(url.toString()).toBe('https://r1.googlevideo.com/audio.m4a');
      expect(options.headers).toEqual({ Range: 'bytes=0-1023' });
      return audioResponse();
    };

    await expect(
      fetchAllowedAudioStream('https://r1.googlevideo.com/audio.m4a', 'bytes=0-1023', fetchImpl)
    ).resolves.toBeInstanceOf(Response);
  });

  it('requests Googlevideo audio from its first byte when the client sends no Range header', async () => {
    const fetchImpl = async (url, options) => {
      expect(url.toString()).toBe('https://r1.googlevideo.com/audio.m4a');
      expect(options.headers).toEqual({ Range: 'bytes=0-1048575' });
      return audioResponse();
    };

    await expect(
      fetchAllowedAudioStream('https://r1.googlevideo.com/audio.m4a', undefined, fetchImpl)
    ).resolves.toBeInstanceOf(Response);
  });
});
