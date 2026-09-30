import {
  getYouTubeMusicArtistProfile,
  searchCatalog,
} from '../catalog';
import { getYouTubeMusicClient } from '../../../services/youtubeMusicClient';

jest.mock('../../../services/youtubeMusicClient', () => {
  const actual = jest.requireActual('../../../services/youtubeMusicClient');
  return {
    ...actual,
    getYouTubeMusicClient: jest.fn(),
    withYouTubeMusicTimeout: jest.fn((promise: Promise<unknown>) => promise),
  };
});

describe('public YouTube Music catalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('searches tracks and artists without requesting Spotify authentication', async () => {
    const search = jest.fn().mockResolvedValue({
      songs: {
        contents: [{
          id: 'abcdefghijk',
          title: 'Tarôs',
          duration: { seconds: 240 },
          artists: [{ channel_id: 'UCartist', name: 'Pedro Qualy' }],
          thumbnail: [{
            url: 'https://images.example/cover=w120-h120-l90-rj',
            width: 120,
          }],
        }],
      },
      artists: {
        contents: [{
          id: 'UCartist',
          name: 'Pedro Qualy',
          thumbnails: [{ url: 'https://images.example/artist.jpg', width: 120 }],
        }],
      },
    });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('Tarôs')).resolves.toMatchObject({
      tracks: [{
        id: 'yt_abcdefghijk',
        title: 'Tarôs',
        imageURL: 'https://images.example/cover=w720-h720-l90-rj',
      }],
      artists: [{
        id: 'ytartist_UCartist~Pedro%20Qualy',
        name: 'Pedro Qualy',
      }],
    });
    expect(search).toHaveBeenCalledWith('Tarôs', { type: 'all' });
  });

  it('tries direct song and artist searches when the combined search is empty', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce({ songs: { contents: [] }, artists: { contents: [] } })
      .mockResolvedValueOnce({ songs: { contents: [{ id: 'abcdefghijk', title: 'Faixa' }] } })
      .mockResolvedValueOnce({ artists: { contents: [{ id: 'UCartist', name: 'Artista' }] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('Faixa')).resolves.toMatchObject({
      tracks: [{ id: 'yt_abcdefghijk', title: 'Faixa' }],
      artists: [{ name: 'Artista' }],
    });
    expect(search).toHaveBeenNthCalledWith(2, 'Faixa', { type: 'song' });
    expect(search).toHaveBeenNthCalledWith(3, 'Faixa', { type: 'artist' });
  });

  it('recovers an artist profile by name when its original browse id fails', async () => {
    const page = {
      header: {
        title: { toString: () => 'Pedro Qualy' },
        thumbnail: { contents: [{ url: 'https://images.example/profile.jpg', width: 800 }] },
      },
      sections: [{ contents: [{
        id: 'abcdefghijk',
        title: 'Tarôs',
        item_type: 'song',
        artists: [{ channel_id: 'UCartist', name: 'Pedro Qualy' }],
        duration: { seconds: 240 },
      }] }],
    };
    const search = jest.fn().mockResolvedValue({
      artists: { contents: [{ id: 'UCartist', name: 'Pedro Qualy' }] },
    });
    const getArtist = jest.fn()
      .mockRejectedValueOnce(new Error('stale artist id'))
      .mockResolvedValueOnce(page);
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_stale~Pedro%20Qualy'
    );

    expect(getArtist).toHaveBeenNthCalledWith(1, 'stale');
    expect(getArtist).toHaveBeenNthCalledWith(2, 'UCartist');
    expect(profile.artist).toMatchObject({
      name: 'Pedro Qualy',
      imageURL: 'https://images.example/profile.jpg',
    });
    expect(profile.tracks).toMatchObject([{ id: 'yt_abcdefghijk', title: 'Tarôs' }]);
  });
});
