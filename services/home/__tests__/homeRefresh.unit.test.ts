import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYouTubeMusicClient } from '../../youtubeMusicClient';
import { loadHomeDiscoveries } from '../personalizedHome';

jest.mock('../../youtubeMusicClient', () => ({ ...jest.requireActual('../../youtubeMusicClient'), getYouTubeMusicClient: jest.fn() }));

it('manual refresh bypasses cached suggestions, changes the anchor and returns unseen radio results first', async () => {
  await AsyncStorage.clear();
  const seed = { name: 'Fresh artist', score: 1 };
  const songs = Array.from({ length: 12 }, (_, index) => ({ id: String(index).padStart(11, '0'),
    title: `Song ${index}`, artists: [{ name: seed.name }], duration: { seconds: 180 } }));
  const search = jest.fn().mockResolvedValue({ songs: { contents: songs } });
  const getUpNext = jest.fn().mockResolvedValueOnce({ contents: [] }).mockResolvedValue({ contents: [
    { video_id: songs[0].id, title: songs[0].title, artists: [{ name: seed.name }] },
    { video_id: 'abcdefghijk', title: 'Actual new result', artists: [{ name: 'Related artist' }] },
  ] });
  jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search, getUpNext } } as never);
  const first = await loadHomeDiscoveries([seed], new Set(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await loadHomeDiscoveries([seed], new Set(), true, true, {
    variation: 1, previousTrackIds: new Set(first.map((track) => track.spotifyId)),
  });
  expect(search).toHaveBeenCalledTimes(2);
  expect(getUpNext).toHaveBeenLastCalledWith(songs[1].id, true);
  expect(second[0].title).toBe('Actual new result');
  await loadHomeDiscoveries([seed], new Set(), true);
  expect(search).toHaveBeenCalledTimes(2);
});

it('publishes a useful discovery while another artist search is still pending', async () => {
  await AsyncStorage.clear();
  const resolvers: Record<string, (result: unknown) => void> = {};
  const search = jest.fn((artist: string) => new Promise((resolve) => { resolvers[artist] = resolve; }));
  jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search, getUpNext: jest.fn().mockResolvedValue({ contents: [] }) } } as never);
  const onUpdate = jest.fn();
  const pending = loadHomeDiscoveries([{ name: 'First Artist', score: 1 },
    { name: 'Second Artist', score: 1 }], new Set(), true, false, { onUpdate });
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  expect(search).toHaveBeenCalledTimes(2);
  resolvers['First Artist']({ songs: { contents: [{ id: 'abcdefghijk', title: 'First Song',
    artists: [{ name: 'First Artist' }], duration: { seconds: 120 } }] } });
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  expect(onUpdate).toHaveBeenCalledWith([expect.objectContaining({ title: 'First Song' })]);
  resolvers['Second Artist']({ songs: { contents: [{ id: 'lmnopqrstuv', title: 'Second Song',
    artists: [{ name: 'Second Artist' }], duration: { seconds: 180 } }] } });
  const result = await pending;
  expect(result.map((item) => item.title)).toEqual(['First Song', 'Second Song']);
});
