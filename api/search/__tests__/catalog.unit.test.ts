import {
  getArtistCatalogImage,
  getYouTubeMusicArtistImage,
  getYouTubeMusicArtistProfile,
  getCachedArtistSearchSeed,
  searchCatalog,
} from '../catalog';
import { getYouTubeMusicClient } from '../../../services/youtubeMusicClient';
import { getSpotifyArtistImage } from '../../../services/metadata/spotifyMetadata';

jest.mock('../../../services/youtubeMusicClient', () => {
  const actual = jest.requireActual('../../../services/youtubeMusicClient');
  return {
    ...actual,
    getYouTubeMusicClient: jest.fn(),
    withYouTubeMusicTimeout: jest.fn((promise: Promise<unknown>) => promise),
  };
});
jest.mock('../../../services/metadata/spotifyMetadata', () => ({
  getSpotifyArtistImage: jest.fn().mockResolvedValue(null),
}));

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
        imageURL: 'https://images.example/artist.jpg',
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

  it('fills a missing artist category even when combined search returned tracks', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce({ songs: { contents: [{ id: 'abcdefghijk', title: 'Known track' }] } })
      .mockResolvedValueOnce({ artists: { contents: [{ id: 'UCmissing', name: 'Missing artist' }] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('fill missing artist category')).resolves.toMatchObject({
      tracks: [{ title: 'Known track' }],
      artists: [{ name: 'Missing artist' }],
    });
    expect(search).toHaveBeenNthCalledWith(2, 'fill missing artist category', { type: 'artist' });
  });

  it('normalizes YouTube Music Text objects and ignores malformed artist fields', async () => {
    const search = jest.fn().mockResolvedValue({
      songs: { contents: [{
        id: 'abcdefghijk',
        title: { toString: () => 'Text track title' },
        duration: { seconds: '126' },
        artists: { malformed: true },
        thumbnail: { contents: [{ url: 'https://images.example/text.jpg', width: '640' }] },
      }] },
      artists: { contents: [{
        id: 'UCtext',
        name: { toString: () => 'Text artist' },
      }] },
    });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('Text object normalization')).resolves.toMatchObject({
      tracks: [{
        title: 'Text track title',
        durationMs: 126_000,
        subtitle: '',
        imageURL: 'https://images.example/text.jpg',
      }],
      artists: [{ id: 'ytartist_UCtext~Text%20artist', name: 'Text artist' }],
    });
  });

  it('keeps matching search tracks available as the artist profile seed', async () => {
    const search = jest.fn().mockResolvedValue({
      songs: { contents: [{
        id: 'abcdefghijk',
        title: 'Seed track',
        artists: [{ channel_id: 'UCseed', name: 'Seed artist' }],
      }] },
      artists: { contents: [{ id: 'UCseed', name: 'Seed artist' }] },
    });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    const results = await searchCatalog('profile seed preservation');
    expect(getCachedArtistSearchSeed(results.artists[0].id)).toMatchObject({
      artist: { name: 'Seed artist' },
      tracks: [{ id: 'yt_abcdefghijk', title: 'Seed track' }],
    });
  });

  it('reports a failed search when both split catalog sources fail', async () => {
    const search = jest.fn().mockRejectedValue(new Error('temporary transport error'));
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('all sources reject')).rejects.toThrow('temporary transport error');
  });

  it('retries just the catalog source that failed and preserves complete results', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce({ songs: { contents: [] }, artists: { contents: [] } })
      .mockRejectedValueOnce(new Error('song source timed out'))
      .mockResolvedValueOnce({ artists: { contents: [{ id: 'UCretry', name: 'Retry artist' }] } })
      .mockResolvedValueOnce({ songs: { contents: [{ id: 'abcdefghijk', title: 'Recovered track' }] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('recover failed catalog source')).resolves.toMatchObject({
      artists: [{ name: 'Retry artist' }],
      tracks: [{ title: 'Recovered track' }],
    });
    expect(search).toHaveBeenNthCalledWith(4, 'recover failed catalog source', { type: 'song' });
    expect(search).toHaveBeenCalledTimes(4);
  });

  it('retries a transient artist profile request with its original browse id', async () => {
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
    expect(getArtist).toHaveBeenNthCalledWith(2, 'stale');
    expect(search).toHaveBeenCalledWith('Pedro Qualy', { type: 'song' });
    expect(search).not.toHaveBeenCalledWith('Pedro Qualy', { type: 'artist' });
    expect(profile.artist).toMatchObject({
      name: 'Pedro Qualy',
      imageURL: 'https://images.example/profile.jpg',
    });
    expect(profile.tracks).toMatchObject([{ id: 'yt_abcdefghijk', title: 'Tarôs' }]);
  });

  it('recovers an artist profile by name after both original-id attempts fail', async () => {
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
      .mockRejectedValueOnce(new Error('stale artist id'))
      .mockResolvedValueOnce(page);
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_stale-second~Pedro%20Qualy'
    );

    expect(getArtist).toHaveBeenNthCalledWith(1, 'stale-second');
    expect(getArtist).toHaveBeenNthCalledWith(2, 'stale-second');
    expect(search).toHaveBeenCalledWith('Pedro Qualy', { type: 'artist' });
    expect(getArtist).toHaveBeenNthCalledWith(3, 'UCartist');
    expect(profile.artist).toMatchObject({ name: 'Pedro Qualy' });
  });

  it('supplements incomplete artist pages and separates featured tracks from participations', async () => {
    const page = {
      header: {
        title: 'Yago Oproprio',
        thumbnail: { contents: [{ url: 'https://images.example/yago.jpg', width: 800 }] },
      },
      sections: [{ contents: [{
        id: 'abcdefghijk',
        title: 'Only track on profile page',
        item_type: 'song',
        artists: [{ channel_id: 'UCyago', name: 'Yago Oproprio' }],
      }] }],
    };
    const search = jest.fn().mockResolvedValue({
      songs: { contents: [
        {
          id: 'abcdefghijk',
          title: 'Only track on profile page',
          artists: [{ channel_id: 'UCyago', name: 'Yago Oproprio' }],
        },
        {
          id: 'lmnopqrstuv',
          title: 'More songs found in search',
          album: {
            name: 'The album',
            thumbnail: [{ url: 'https://images.example/album-cover=w120-h120-l90-rj', width: 120 }],
          },
          artists: [{ channel_id: 'UCyago', name: 'Yago Oproprio' }],
        },
        {
          id: '12345678901',
          title: 'Yago as a guest',
          artists: [
            { channel_id: 'UCmain', name: 'Main artist' },
            { channel_id: 'UCyago', name: 'Yago Oproprio' },
          ],
        },
        {
          id: 'zyxwvutsrqp',
          title: 'Unrelated result',
          artists: [{ channel_id: 'UCother', name: 'Other artist' }],
        },
      ] },
    });
    const getArtist = jest.fn().mockResolvedValue(page);
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_UCyago~Yago%20Oproprio'
    );

    expect(search).toHaveBeenCalledWith('Yago Oproprio', { type: 'song' });
    expect(profile.tracks.map((track) => track.title)).toEqual([
      'Only track on profile page',
      'More songs found in search',
    ]);
    expect(profile.tracks[1].imageURL).toBe('https://images.example/album-cover=w720-h720-l90-rj');
    expect(profile.participationTracks.map((track) => track.title)).toEqual([
      'Yago as a guest',
    ]);
  });

  it('loads complete artist song shelves and their continuation pages', async () => {
    const secondPage = {
      items: [{
        id: 'lmnopqrstuv',
        title: 'Guest appearance',
        artists: [
          { channel_id: 'UCmain', name: 'Main artist' },
          { channel_id: 'UCcatalog', name: 'Catalog artist' },
        ],
      }],
      has_continuation: false,
    };
    const firstPage = {
      items: [{
        id: 'abcdefghijk',
        title: 'Catalog single',
        artists: [{ channel_id: 'UCcatalog', name: 'Catalog artist' }],
      }],
      has_continuation: true,
      getContinuation: jest.fn().mockResolvedValue(secondPage),
    };
    const search = jest.fn().mockResolvedValue({ songs: { contents: [] } });
    const getArtist = jest.fn().mockResolvedValue({
      header: { title: 'Catalog artist' },
      sections: [],
      getAllSongs: jest.fn().mockResolvedValue({ playlist_id: 'VLcatalog' }),
    });
    const getPlaylist = jest.fn().mockResolvedValue(firstPage);
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist, getPlaylist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_UCcatalog~Catalog%20artist'
    );

    expect(getPlaylist).toHaveBeenCalledWith('VLcatalog');
    expect(firstPage.getContinuation).toHaveBeenCalledTimes(1);
    expect(profile.tracks.map((track) => track.title)).toEqual(['Catalog single']);
    expect(profile.participationTracks.map((track) => track.title)).toEqual(['Guest appearance']);
  });

  it('keeps album, single, and EP shelves in the artist profile', async () => {
    const search = jest.fn().mockResolvedValue({ songs: { contents: [] } });
    const getArtist = jest.fn().mockResolvedValue({
      header: { title: 'Catalog artist' },
      sections: [
        {
          header: { title: 'Albums' },
          contents: [{
            id: 'MPREb-album',
            item_type: 'album',
            title: 'Album oficial',
            year: '2024',
            thumbnail: [{ url: 'https://images.example/album=w120-h120', width: 120 }],
          }],
        },
        {
          header: { title: 'Singles' },
          contents: [{
            id: 'MPREb-single',
            item_type: 'album',
            title: 'Single oficial',
            year: '2025',
          }],
        },
        {
          header: { title: 'EPs' },
          contents: [{
            id: 'MPREb-ep',
            item_type: 'album',
            title: 'EP oficial',
          }],
        },
      ],
    });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_UCcatalog-releases~Catalog%20artist'
    );

    expect(profile.albums).toEqual([
      expect.objectContaining({ title: 'Album oficial', subtitle: '2024 · album' }),
      expect.objectContaining({ title: 'Single oficial', subtitle: '2025 · single' }),
      expect.objectContaining({ title: 'EP oficial', subtitle: 'EP' }),
    ]);
  });

  it('gets the matching artist image without loading a full profile or using a fan result', async () => {
    const search = jest.fn().mockResolvedValue({
      artists: { contents: [
        {
          id: 'UCfan',
          name: 'Pedro Qualy',
          thumbnails: [{ url: 'https://images.example/fan.jpg', width: 800 }],
        },
        {
          id: 'UCartist',
          name: 'Pedro Qualy',
          thumbnails: [{ url: 'https://images.example/official.jpg', width: 800 }],
        },
      ] },
    });
    const getArtist = jest.fn().mockResolvedValue({});
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    await expect(
      getYouTubeMusicArtistImage('ytartist_UCartist~Pedro%20Qualy')
    ).resolves.toBe('https://images.example/official.jpg');
    expect(search).toHaveBeenCalledWith('Pedro Qualy', { type: 'artist' });
    expect(getArtist).toHaveBeenCalledWith('UCartist');
  });

  it('uses the artist page portrait before searching the catalog', async () => {
    const getArtist = jest.fn().mockResolvedValue({
      header: {
        thumbnail: { contents: [{ url: 'https://images.example/artist-page.jpg', width: 800 }] },
      },
    });
    const search = jest.fn();
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    await expect(
      getYouTubeMusicArtistImage('ytartist_UCartistPage~Pedro%20Qualy')
    ).resolves.toBe('https://images.example/artist-page.jpg');
    expect(getArtist).toHaveBeenCalledWith('UCartistPage');
    expect(search).not.toHaveBeenCalled();
  });

  it('falls back to the public Spotify portrait only when YouTube has no image', async () => {
    jest.mocked(getSpotifyArtistImage).mockResolvedValue('https://images.example/spotify.jpg');
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: {
        search: jest.fn().mockResolvedValue({ artists: { contents: [] } }),
        getArtist: jest.fn().mockResolvedValue({}),
      },
    } as never);

    await expect(
      getArtistCatalogImage('1234567890123456789012', 'Artist without YTM portrait')
    ).resolves.toBe('https://images.example/spotify.jpg');
    expect(getSpotifyArtistImage).toHaveBeenCalledWith('1234567890123456789012');
  });
});
