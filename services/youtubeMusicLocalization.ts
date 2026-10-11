import type { YouTubeMusicClient, YouTubeMusicItem, YouTubeMusicArtistPage } from './youtubeMusicClient';

type Shelf = { type?: string; title?: unknown; contents?: YouTubeMusicItem[];
  endpoint?: { call: (actions: unknown, options: object) => Promise<{
    contents_memo?: { get: (type: string) => Awaited<ReturnType<NonNullable<YouTubeMusicArtistPage['getAllSongs']>>>[] };
  }> } };

/** Vendor convenience getters only recognize English shelf labels. */
export const localizeYouTubeMusicClient = (
  client: YouTubeMusicClient, text: (value: unknown) => string,
): YouTubeMusicClient => {
  const titleOf = (shelf: Shelf) => text(shelf.title).toLocaleLowerCase();
  // Innertube.music is a factory getter, so keep one bound instance.
  const music = client.music;
  const search: YouTubeMusicClient['music']['search'] = async (query, filters) => {
    const result = await music.search(query, filters);
    const shelves = (result as typeof result & { contents?: Shelf[] }).contents || [];
    return { ...result,
      songs: result.songs || shelves.find((shelf) => ['songs', 'musicas', 'músicas'].includes(titleOf(shelf))),
      artists: result.artists || shelves.find((shelf) => ['artists', 'artistas'].includes(titleOf(shelf))),
    };
  };
  const getArtist: YouTubeMusicClient['music']['getArtist'] = async (id) => {
    const page = await music.getArtist(id);
    const shelf = (page.sections as Shelf[] | undefined)?.find((section) =>
      section.type === 'MusicShelf' && ['top músicas', 'músicas em destaque', 'principais músicas', 'top songs'].includes(titleOf(section)));
    if (!shelf?.endpoint || titleOf(shelf) === 'top songs') return page;
    return { ...page, getAllSongs: async () => {
      const result = await shelf.endpoint!.call((client as YouTubeMusicClient & { actions?: unknown }).actions,
        { client: 'YTMUSIC', parse: true });
      return result.contents_memo?.get('MusicPlaylistShelf')?.[0] || { contents: [] };
    } };
  };
  return { music: {
    search, getArtist,
    getPlaylist: music.getPlaylist?.bind(music), getAlbum: music.getAlbum?.bind(music),
    getUpNext: music.getUpNext?.bind(music), getSearchSuggestions: music.getSearchSuggestions?.bind(music),
  }, getChannel: client.getChannel?.bind(client) };
};
