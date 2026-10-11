import { localizeYouTubeMusicClient } from '../youtubeMusicLocalization';
import { getYouTubeMusicText } from '../youtubeMusicClient';

describe('localized music catalog', () => {
  it('keeps wrappers when the vendor music property creates a new instance on each access', async () => {
    const createMusic = jest.fn(() => ({
      search: jest.fn().mockResolvedValue({ contents: [{ title: 'Músicas', contents: [{ title: 'RADIOATIVO' }] }] }),
      getArtist: jest.fn(),
    }));
    const raw = { get music() { return createMusic(); } };
    const client = localizeYouTubeMusicClient(raw as never, getYouTubeMusicText);
    expect((await client.music.search('RADIOATIVO', { type: 'song' })).songs?.contents)
      .toEqual([{ title: 'RADIOATIVO' }]);
    expect(createMusic).toHaveBeenCalledTimes(1);
  });
  it('reads Portuguese search shelves without translating the recording title', async () => {
    const song = { title: 'RADIOATIVO', id: '7QmrzkYiy94' };
    const artist = { name: '7 Minutoz', id: 'UC7tLuFSDy-yNoNFUOxef8QA' };
    const client = localizeYouTubeMusicClient({ music: {
      search: jest.fn().mockResolvedValue({ contents: [
        { title: { text: 'Músicas' }, contents: [song] },
        { title: { text: 'Artistas' }, contents: [artist] },
      ] }), getArtist: jest.fn(),
    } } as never, getYouTubeMusicText);
    expect(await client.music.search('7 Minutoz', { type: 'all' })).toMatchObject({
      songs: { contents: [song] }, artists: { contents: [artist] },
    });
  });

  it('loads the complete Top músicas shelf using the vendor endpoint', async () => {
    const songs = { contents: [{ id: 'abcdefghijk', title: 'Sinceramente' }], playlist_id: 'playlist' };
    const call = jest.fn().mockResolvedValue({ contents_memo: new Map([['MusicPlaylistShelf', [songs]]]) });
    const actions = { marker: 'actions' };
    const client = localizeYouTubeMusicClient({ actions, music: {
      search: jest.fn(), getArtist: jest.fn().mockResolvedValue({
        header: { title: 'Sotam' }, sections: [
          { type: 'MusicShelf', title: { text: 'Top músicas' }, endpoint: { call } },
        ], getAllSongs: jest.fn().mockRejectedValue(new Error('English-only getter')),
      }),
    } } as never, getYouTubeMusicText);
    const page = await client.music.getArtist('channel');
    expect(await page.getAllSongs!()).toBe(songs);
    expect(call).toHaveBeenCalledWith(actions, { client: 'YTMUSIC', parse: true });
  });

  it('preserves the English getters and their method receivers', async () => {
    const songs = { contents: [{ id: 'abcdefghijk' }] };
    const getAllSongs = jest.fn().mockResolvedValue(songs);
    const page = { sections: [{ type: 'MusicShelf', title: { text: 'Top songs' } }], getAllSongs };
    const client = localizeYouTubeMusicClient({ music: {
      search: jest.fn().mockResolvedValue({ songs }), getArtist: jest.fn().mockResolvedValue(page),
    } } as never, getYouTubeMusicText);
    expect((await client.music.search('song', { type: 'song' })).songs).toBe(songs);
    expect(await client.music.getArtist('channel')).toBe(page);
    await page.getAllSongs();
    expect(getAllSongs.mock.instances[0]).toBe(page);
  });
});
