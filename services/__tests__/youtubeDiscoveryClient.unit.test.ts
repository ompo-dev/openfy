import { getYouTubeDiscoveryClient, getYouTubeVideoMetadata, resetYouTubeDiscoveryForTests } from '../youtubeDiscoveryClient';
import { createYouTubeMusicClient } from '../youtubeMusicRuntime';
import { localizeYouTubeMusicClient } from '../youtubeMusicLocalization';

jest.mock('../youtubeMusicRuntime', () => ({ createYouTubeMusicClient: jest.fn() }));
beforeEach(() => { resetYouTubeDiscoveryForTests(); jest.mocked(createYouTubeMusicClient).mockReset(); });

it('coalesces session initialization and metadata reads without retrieving player JS', async () => {
  const getBasicInfo = jest.fn().mockResolvedValue({ basic_info: { title: 'Song', author: 'Artist', duration: 180 },
    streaming_data: { staleUrl: 'not-a-metadata-field' } });
  const raw = { music: {}, getBasicInfo } as unknown as Awaited<ReturnType<typeof createYouTubeMusicClient>>;
  jest.mocked(createYouTubeMusicClient).mockResolvedValue(raw);
  const [first, second] = await Promise.all([getYouTubeDiscoveryClient(), getYouTubeDiscoveryClient()]);
  expect(first).toBe(second);
  await Promise.all([getYouTubeVideoMetadata('abcdefghijk'), getYouTubeVideoMetadata('abcdefghijk')]);
  await getYouTubeVideoMetadata('abcdefghijk');
  expect(createYouTubeMusicClient).toHaveBeenCalledTimes(1);
  expect(createYouTubeMusicClient).toHaveBeenCalledWith(expect.objectContaining({ retrieve_player: false }));
  expect(getBasicInfo).toHaveBeenCalledTimes(1);
  expect(await getYouTubeVideoMetadata('abcdefghijk')).not.toHaveProperty('streaming_data');
});

it('retries initialization after a network failure and forwards native lyric lookup after localization', async () => {
  jest.mocked(createYouTubeMusicClient).mockRejectedValueOnce(new Error('offline'));
  await expect(getYouTubeDiscoveryClient()).rejects.toThrow('offline');
  const getLyrics = jest.fn().mockResolvedValue({ description: 'Lyrics' });
  const raw = { music: { getLyrics } } as unknown as Awaited<ReturnType<typeof createYouTubeMusicClient>>;
  jest.mocked(createYouTubeMusicClient).mockResolvedValueOnce(raw);
  const localized = localizeYouTubeMusicClient(await getYouTubeDiscoveryClient(), String);
  await expect(localized.music.getLyrics!('abcdefghijk')).resolves.toEqual({ description: 'Lyrics' });
  expect(getLyrics).toHaveBeenCalledWith('abcdefghijk');
});

it('does not keep an empty metadata response as a valid recording', async () => {
  const getBasicInfo = jest.fn().mockResolvedValueOnce({ basic_info: {} })
    .mockResolvedValue({ basic_info: { title: 'Recovered song', duration: 180 } });
  jest.mocked(createYouTubeMusicClient).mockResolvedValue({ music: {}, getBasicInfo } as unknown as
    Awaited<ReturnType<typeof createYouTubeMusicClient>>);
  await getYouTubeVideoMetadata('abcdefghijk');
  await expect(getYouTubeVideoMetadata('abcdefghijk')).resolves.toMatchObject({ basic_info: { title: 'Recovered song' } });
  expect(getBasicInfo).toHaveBeenCalledTimes(2);
});
