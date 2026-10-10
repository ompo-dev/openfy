import type { FollowArtistInput } from '../followedArtists';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const artist: FollowArtistInput = { id: 'ytartist_ebony', name: 'Ebony', imageURL: 'https://image.test/ebony.jpg' };
const load = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../followedArtists') as typeof import('../followedArtists');
};
const storage = () => jest.requireMock('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage').default;

describe('followed artists', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.mocked(storage().getItem).mockReset().mockResolvedValue(null);
    jest.mocked(storage().setItem).mockReset().mockResolvedValue(undefined);
  });

  it('persists follows and hydrates their real profile picture after restart', async () => {
    await load().setArtistFollowed(artist, true);
    const saved = jest.mocked(storage().setItem).mock.calls.at(-1)![1];
    jest.resetModules();
    jest.mocked(storage().getItem).mockResolvedValue(saved);
    await expect(load().getFollowedArtists()).resolves.toEqual([{ ...artist, followedAt: expect.any(Number) }]);
  });

  it('serializes follow/unfollow and merges alternate routes for the same artist', async () => {
    const service = load();
    await Promise.all([
      service.setArtistFollowed(artist, true),
      service.setArtistFollowed({ ...artist, id: 'spotify-id', name: '  EBONY  ', imageURL: '' }, true),
    ]);
    expect(service.getFollowedArtistsSnapshot()).toHaveLength(1);
    expect(service.getFollowedArtistsSnapshot()[0].imageURL).toBe(artist.imageURL);
    expect(service.isArtistFollowed({ name: 'Ebony', id: artist.id })).toBe(true);
    await service.setArtistFollowed(artist, false);
    expect(service.getFollowedArtistsSnapshot()).toEqual([]);
  });

  it('does not publish a follow when persistence fails and can retry', async () => {
    const service = load();
    const updates = jest.fn();
    const unsubscribe = service.subscribeFollowedArtists(updates);
    await service.getFollowedArtists();
    updates.mockClear();
    jest.mocked(storage().setItem).mockRejectedValueOnce(new Error('storage'));
    await expect(service.setArtistFollowed(artist, true)).rejects.toThrow('storage');
    expect(updates).not.toHaveBeenCalled();
    expect(service.getFollowedArtistsSnapshot()).toEqual([]);
    await service.setArtistFollowed(artist, true);
    expect(updates).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not replace stored follows with an empty list after a read failure', async () => {
    jest.mocked(storage().getItem).mockRejectedValueOnce(new Error('read'));
    await expect(load().setArtistFollowed(artist, true)).rejects.toThrow('read');
    expect(storage().setItem).not.toHaveBeenCalled();
    jest.mocked(storage().getItem).mockResolvedValue(JSON.stringify([{ ...artist, followedAt: 1 }]));
    await expect(load().getFollowedArtists()).resolves.toHaveLength(1);
  });
});
