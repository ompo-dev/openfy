import {
  getArtistCatalogImage,
  getYouTubeMusicArtistImage,
  getYouTubeMusicArtistProfile,
  subscribeYouTubeMusicArtistProfile,
  getCachedArtistSearchSeed,
  searchCatalog,
  getCatalogSearchSuggestions,
  toYouTubeMusicTrackModel,
} from '../catalog';
import { getYouTubeMusicClient } from '../../../services/youtubeMusicClient';
import { getSpotifyArtistImage } from '../../../services/metadata/spotifyMetadata';
import { _clearArtistIdentitiesForTests } from '../../../services/search/artistIdentity';

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
  beforeEach(() => { jest.clearAllMocks(); _clearArtistIdentitiesForTests(); });

  it('deduplicates Sotam/RND by channel and keeps the actual artist shelf name and portrait', async () => {
    const channel = 'UCHguBpZUpBR52kmx9DMCTFA';
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      search: jest.fn().mockResolvedValue({
        songs: { contents: [{ id: 'abcdefghijk', title: 'Sotam alias recording',
          artists: [{ name: 'RND', channel_id: channel }] }] },
        artists: { contents: [{ id: channel, name: 'Sotam',
          thumbnails: [{ url: 'https://images.example/sotam.jpg', width: 720 }] }] },
      }),
    } } as never);
    const results = await searchCatalog('Sotam alias regression');
    expect(results.artists).toEqual([{ type: 'artist', id: `ytartist_${channel}~Sotam`,
      name: 'Sotam', imageURL: 'https://images.example/sotam.jpg' }]);
    expect(results.tracks[0]).toMatchObject({ subtitle: 'Sotam',
      artists: [{ id: `ytartist_${channel}~Sotam`, name: 'Sotam' }] });
    expect(getCachedArtistSearchSeed(`ytartist_${channel}~RND`)?.tracks).toHaveLength(1);
  });

  it('coalesces renamed routes into one progressive profile request and one catalog', async () => {
    const channel = 'UCprofileAlias';
    const song = { id: 'abcdefghijk', title: 'Canonical song',
      artists: [{ channel_id: channel, name: 'RND' }] };
    const getArtist = jest.fn().mockResolvedValue({ header: { title: 'Sotam',
      thumbnail: [{ url: 'https://images.example/alias-sotam.jpg', width: 720 }] }, sections: [{ contents: [song] }] });
    const search = jest.fn().mockResolvedValue({ songs: { contents: [song] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { getArtist, search } } as never);
    const listener = jest.fn();
    const stop = subscribeYouTubeMusicArtistProfile(`ytartist_${channel}~Sotam`, listener);
    const [old, current] = await Promise.all([
      getYouTubeMusicArtistProfile(`ytartist_${channel}~RND`),
      getYouTubeMusicArtistProfile(`ytartist_${channel}~Sotam`),
    ]);
    stop();
    expect(old).toBe(current);
    expect(current.artist).toMatchObject({ id: `ytartist_${channel}~Sotam`, name: 'Sotam' });
    expect(current.tracks).toHaveLength(1);
    expect(current.tracks[0].subtitle).toBe('Sotam');
    expect(getArtist).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
  });

  it('accepts the actual channel id without requiring a display-name route', async () => {
    const channel = `UC${'r'.repeat(22)}`;
    const getArtist = jest.fn().mockResolvedValue({ header: { title: 'Native channel' }, sections: [] });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { getArtist } } as never);
    expect((await getYouTubeMusicArtistProfile(channel)).artist.id).toBe(`ytartist_${channel}~Native%20channel`);
    expect(getArtist).toHaveBeenCalledWith(channel);
  });

  it('does not invent artist profiles from credits lacking a channel endpoint', async () => {
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      search: jest.fn().mockResolvedValue({
        songs: { contents: [{ id: 'abcdefghijk', title: 'Unlinked credit', artists: [{ name: 'Sid' }] }] },
        artists: { contents: [{ name: 'Sid' }] },
      }),
    } } as never);
    const results = await searchCatalog('unlinked artist endpoint regression');
    expect(results.artists).toEqual([]);
    expect(results.tracks[0].artists).toEqual([{ id: '', name: 'Sid' }]);
  });

  it('excludes related videos, uncredited recordings and same-name foreign artists from a profile queue', async () => {
    const channel = 'UCstrictProfile';
    const own = { id: 'abcdefghijk', title: 'Own song', artists: [{ channel_id: channel, name: 'Sid' }] };
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      getArtist: jest.fn().mockResolvedValue({ header: { title: 'Sid' }, sections: [{ contents: [own,
        { id: 'lmnopqrstuv', title: 'Other Sid', artists: [{ channel_id: 'UCotherSid', name: 'Sid' }] },
        { id: '12345678901', title: 'Uncredited video' },
      ] }] }), search: jest.fn().mockResolvedValue({ songs: { contents: [] } }),
    } } as never);
    expect((await getYouTubeMusicArtistProfile(`ytartist_${channel}~Sid`)).tracks).toEqual([
      expect.objectContaining({ title: 'Own song' }),
    ]);
  });

  it.each([
    ['84M plays', 84_000_000], ['1,2 mi reproduções', 1_200_000],
    ['750K views', 750_000], ['1.234.567 visualizações', 1_234_567],
  ])('reads the real track play count from %s', (label, expected) => {
    expect(toYouTubeMusicTrackModel({ id: 'abcdefghijk', title: 'Song',
      flex_columns: [{ title: 'Sid & Tavin' }, { title: label }] })?.viewCount).toBe(expected);
  });

  it('enriches header songs with play counts from the complete shelf instead of discarding duplicate IDs', async () => {
    const song = { id: 'abcdefghijk', title: 'Popular song', item_type: 'song',
      artists: [{ channel_id: 'UCplaycounts', name: 'Play counts' }] };
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      search: jest.fn().mockResolvedValue({ songs: { contents: [] } }),
      getArtist: jest.fn().mockResolvedValue({ header: { title: 'Play counts' },
        sections: [{ contents: [song] }],
        getAllSongs: jest.fn().mockResolvedValue({ contents: [{ ...song,
          flex_columns: [{ title: '84M plays' }] }] }),
      }),
    } } as never);

    const profile = await getYouTubeMusicArtistProfile('ytartist_UCplaycounts~Play%20counts');
    expect(profile.tracks).toHaveLength(1);
    expect(profile.tracks[0]).toMatchObject({ title: 'Popular song', viewCount: 84_000_000 });
  });

  it('publishes the real header and initial songs while the channel shelf is still pending', async () => {
    const id = 'ytartist_UCprogressive~Progressive';
    let finishSearch!: (value: unknown) => void;
    const page = {
      header: { title: 'Progressive', description: 'Biography',
        thumbnail: { contents: [{ url: 'https://images.example/progressive.jpg', width: 800 }] } },
      sections: [{ contents: [{ id: 'abcdefghijk', title: 'First song', item_type: 'song',
        artists: [{ channel_id: 'UCprogressive', name: 'Progressive' }] }] }],
      getAllSongs: jest.fn(() => new Promise((resolve) => { finishSearch = resolve; })),
    };
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      getArtist: jest.fn().mockResolvedValue(page),
      search: jest.fn(),
    } } as never);
    let notify!: () => void;
    const initial = new Promise<void>((resolve) => { notify = resolve; });
    const listener = jest.fn(() => notify());
    const unsubscribe = subscribeYouTubeMusicArtistProfile(id, listener);
    let finished = false;
    const full = getYouTubeMusicArtistProfile(id).then((value) => { finished = true; return value; });
    await initial;
    expect(finished).toBe(false);
    expect(listener.mock.calls[0]).toEqual([expect.objectContaining({
      artist: expect.objectContaining({ name: 'Progressive', imageURL: 'https://images.example/progressive.jpg' }),
      tracks: [expect.objectContaining({ title: 'First song' })],
    })]);
    finishSearch({ contents: [] });
    await full;
    unsubscribe();
  });

  it('reads and deduplicates autocomplete text from the music catalog', async () => {
    const getSearchSuggestions = jest.fn().mockResolvedValue([{ contents: [
      { suggestion: { text: 'Sotam sinceramente', runs: [{ text: 'Sotam ' }, { text: 'sinceramente' }] } },
      { suggestion: 'sotam sinceramente' }, { suggestion: { text: 'Sotam cura' } }, { suggestion: {} },
    ] }]);
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { getSearchSuggestions } } as never);
    await expect(getCatalogSearchSuggestions('aotam')).resolves.toEqual(['Sotam sinceramente', 'Sotam cura']);
    await getCatalogSearchSuggestions('AOTAM');
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
  });

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

  it('shows the credited artist when a corrected typo returns only songs', async () => {
    const search = jest.fn()
      .mockResolvedValueOnce({
        songs: { contents: [{
          id: 'abcdefghijk',
          title: 'Sinceramente',
          artists: [{ channel_id: 'UCsotam', name: 'Sotam' }],
        }] },
        artists: { contents: [] },
      })
      .mockResolvedValueOnce({ artists: { contents: [] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search },
    } as never);

    await expect(searchCatalog('aotam')).resolves.toMatchObject({
      artists: [{ id: 'ytartist_UCsotam~Sotam', name: 'Sotam' }],
      tracks: [{ title: 'Sinceramente' }],
    });
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
        artists: [{ channel_id: 'UCstale', name: 'Pedro Qualy' }],
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
      'ytartist_UCstale~Pedro%20Qualy'
    );

    expect(getArtist).toHaveBeenNthCalledWith(1, 'UCstale');
    expect(getArtist).toHaveBeenNthCalledWith(2, 'UCstale');
    expect(search).not.toHaveBeenCalled();
    expect(profile.artist).toMatchObject({
      name: 'Pedro Qualy',
      imageURL: 'https://images.example/profile.jpg',
    });
    expect(profile.tracks).toMatchObject([{ id: 'yt_abcdefghijk', title: 'Tarôs' }]);
  });

  it('does not replace a known artist identity with a homonym after a profile failure', async () => {
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

    await expect(getYouTubeMusicArtistProfile(
      'ytartist_UCstale-second~Pedro%20Qualy'
    )).rejects.toThrow('Não foi possível carregar este artista agora.');

    expect(getArtist).toHaveBeenNthCalledWith(1, 'UCstale-second');
    expect(getArtist).toHaveBeenNthCalledWith(2, 'UCstale-second');
    expect(search).not.toHaveBeenCalledWith('Pedro Qualy', { type: 'artist' });
    expect(getArtist).toHaveBeenCalledTimes(2);
  });

  it('loads the channel song shelf and separates primary credits from participations', async () => {
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
    const songShelf = { contents: [
        {
          id: 'abcdefghijk',
          title: 'Only track on profile page',
          artists: [{ channel_id: 'UCyago', name: 'Yago Oproprio' }],
        },
        {
          id: 'lmnopqrstuv',
          title: 'More songs in the channel catalog',
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
      ] };
    const search = jest.fn();
    const getAllSongs = jest.fn().mockResolvedValue(songShelf);
    const getArtist = jest.fn().mockResolvedValue({ ...page, getAllSongs });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: { search, getArtist },
    } as never);

    const profile = await getYouTubeMusicArtistProfile(
      'ytartist_UCyago~Yago%20Oproprio'
    );

    expect(getAllSongs).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(profile.tracks.map((track) => track.title)).toEqual([
      'Only track on profile page',
      'More songs in the channel catalog',
    ]);
    expect(profile.tracks[1].imageURL).toBe('https://images.example/album-cover=w720-h720-l90-rj');
    expect(profile.participationTracks.map((track) => track.title)).toEqual([
      'Yago as a guest',
    ]);
  });

  it('keeps the most viewed own-channel recordings first after new catalog pages arrive', async () => {
    const own = (id: string, title: string, views: number) => ({ id, title, view_count: views,
      artists: [{ channel_id: 'UCranked', name: 'Ranked' }] });
    const getArtist = jest.fn().mockResolvedValue({
      header: { title: 'Ranked', thumbnail: [{ url: 'https://images.example/ranked.jpg', width: 720 }] },
      sections: [{ contents: [own('abcdefghijk', 'Less viewed', 10)] }],
      getAllSongs: jest.fn().mockResolvedValue({ contents: [own('lmnopqrstuv', 'Most viewed', 1_000_000)] }),
    });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { getArtist } } as never);
    const snapshots: string[][] = [];
    const stop = subscribeYouTubeMusicArtistProfile('ytartist_UCranked~Ranked', (profile) => {
      snapshots.push(profile.tracks.map((track) => track.title));
    });
    const profile = await getYouTubeMusicArtistProfile('ytartist_UCranked~Ranked');
    stop();
    expect(snapshots[0]).toEqual(['Less viewed']);
    expect(profile.tracks.map((track) => track.title)).toEqual(['Most viewed', 'Less viewed']);
    expect(snapshots.at(-1)).toEqual(['Most viewed', 'Less viewed']);
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
          header: { title: 'Álbuns' },
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
    ]);
    expect(profile.singlesAndEps).toEqual([
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

  it('does not replace a missing channel portrait with a Spotify or homonymous artist image', async () => {
    jest.mocked(getSpotifyArtistImage).mockResolvedValue('https://images.example/spotify.jpg');
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({
      music: {
        search: jest.fn().mockResolvedValue({ artists: { contents: [] } }),
        getArtist: jest.fn().mockResolvedValue({}),
      },
    } as never);

    await expect(
      getArtistCatalogImage('1234567890123456789012', 'Artist without YTM portrait')
    ).resolves.toBe('');
    expect(getSpotifyArtistImage).not.toHaveBeenCalled();
  });
});
