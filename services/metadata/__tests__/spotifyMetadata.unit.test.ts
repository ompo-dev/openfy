const TRACK_ID = '5MzjslXCcY4XQtCmgk3eum';
const ALBUM_ID = '5gAO1YnNTdb2hoSHLLNk4T';
const PLAYLIST_ID = '37i9dQZF1DXcBWIGoYBM5M';
const ARTISTS = [
  { id: '0xKbHuoAoxvPu5uGax4d9l', name: 'Sotam' },
  { id: '2erZl4yKXwwHO92guRhDPw', name: 'Rob' },
  { id: '1WSSOsnMl5OIaxB7xrY9dc', name: 'Felipe Phyre' },
  { id: '3ZfuJqd34fmfkTMpqDW2iI', name: 'Matheus Muniz' },
];
const TITLE = 'Indecis\u00e3o';
const ALBUM_NAME = 'Fiquei o tempo que precisei';
const ORIGIN = 'https://open.spotify.com/';
const images = [300, 64, 640].map((maxWidth) => ({ url: `https://i.scdn.co/image/cover-${maxWidth}`, maxWidth }));
const trackEntity = {
  uri: `spotify:track:${TRACK_ID}`,
  name: TITLE,
  duration: 158250,
  artists: ARTISTS.map(({ id, name }) => ({ uri: `spotify:artist:${id}`, name })),
  visualIdentity: { image: images },
};
const embed = (entity: object) => `<script nonce='test' type='application/json' id='__NEXT_DATA__'>${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script>`;
const meta = (name: string, content: string) => `<meta content='${content}' name='${name}'/>`;
const publicPage = (type: string, id: string, entity?: object) =>
  meta('og:url', `${ORIGIN}${type}/${id}`) + (entity ? `<script type='text/plain' id='initialState'>${Buffer.from(JSON.stringify({ entities: { items: { [`spotify:${type}:${id}`]: entity } } })).toString('base64')}</script>` : '');

describe('public Spotify metadata', () => {
  let subject: typeof import('../spotifyMetadata');
  let pages: Map<string, string>;
  const fetchMock = global.fetch as jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    subject = jest.requireActual('../spotifyMetadata');
    pages = new Map([
      [`embed/track/${TRACK_ID}`, embed(trackEntity)],
      [`track/${TRACK_ID}`, publicPage('track', TRACK_ID) + meta('og:title', TITLE) + meta('music:album', `${ORIGIN}album/${ALBUM_ID}`) + meta('music:album:track', '2') + meta('music:duration', '158') + meta('og:description', `Sotam, Rob, Felipe Phyre, Matheus Muniz \u00b7 ${ALBUM_NAME} \u00b7 Song \u00b7 2026`)],
      [`album/${ALBUM_ID}`, publicPage('album', ALBUM_ID, {
        uri: `spotify:album:${ALBUM_ID}`,
        name: ALBUM_NAME,
        artists: { items: [{ uri: `spotify:artist:${ARTISTS[0].id}`, profile: { name: 'Sotam' } }] },
      }) + meta('music:song', `${ORIGIN}track/${TRACK_ID}`) + meta('music:song:disc', '1') + meta('music:song:track', '2')],
    ]);
    fetchMock.mockReset().mockImplementation(async (url: string) => ({
      ok: pages.has(url.slice(ORIGIN.length)),
      url,
      text: async () => pages.get(url.slice(ORIGIN.length)) ?? '',
    }));
  });

  afterEach(() => jest.useRealTimers());

  it('combines live-shaped embed and public pages, preserving IDs and the widest cover', async () => {
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toEqual({
      spotifyId: TRACK_ID,
      title: TITLE,
      artistName: ARTISTS.map((artist) => artist.name).join(', '),
      artists: ARTISTS,
      albumName: ALBUM_NAME,
      albumId: ALBUM_ID,
      albumArtists: [ARTISTS[0]],
      imageURL: images[2].url,
      duration_ms: 158250,
      trackNumber: 2,
      discNumber: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(ORIGIN))).toBe(true);
  });

  it('reads UTF-8 structured track/album state when the track embed is unavailable', async () => {
    pages.delete(`embed/track/${TRACK_ID}`);
    pages.set(`track/${TRACK_ID}`, publicPage('track', TRACK_ID, {
      uri: `spotify:track:${TRACK_ID}`,
      name: TITLE,
      duration: { totalMilliseconds: 158250 },
      trackNumber: 2,
      albumOfTrack: {
        uri: `spotify:album:${ALBUM_ID}`,
        name: ALBUM_NAME,
        coverArt: { sources: images.map(({ url, maxWidth }) => ({ url, width: maxWidth })) },
        tracks: { items: [{ track: { uri: trackEntity.uri, artists: { items: ARTISTS.map(({ id, name }) => ({ id, profile: { name } })) } } }] },
      },
    }));
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toMatchObject({ title: TITLE, artists: ARTISTS, albumName: ALBUM_NAME, imageURL: images[2].url, duration_ms: 158250 });
  });

  it('returns the known embed fields when the other pages fail, without a fabricated album', async () => {
    pages.delete(`track/${TRACK_ID}`);
    const metadata = await subject.fetchSpotifyTrackMetadata(TRACK_ID);
    expect(metadata).toMatchObject({ artists: ARTISTS, duration_ms: 158250, albumId: '', albumName: '', albumArtists: [] });
    expect(metadata).not.toHaveProperty('discNumber');
    expect(metadata).not.toHaveProperty('trackNumber');
  });

  it('retains meta tags when state is malformed and decodes HTML entities', async () => {
    pages.delete(`embed/track/${TRACK_ID}`);
    pages.delete(`album/${ALBUM_ID}`);
    pages.set(`track/${TRACK_ID}`, publicPage('track', TRACK_ID) + '<script id="initialState">broken!</script>' + meta('og:title', 'A &amp; B &#39;Mix&#39;') + meta('og:description', 'Sotam &middot; Fiquei o tempo que precisei &middot; Song &middot; 2026') + meta('music:duration', '158'));
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toMatchObject({ title: "A & B 'Mix'", artistName: 'Sotam', albumName: ALBUM_NAME, artists: [], duration_ms: 158000 });
  });

  it('uses album embed data when the album public page fails', async () => {
    pages.delete(`album/${ALBUM_ID}`);
    pages.set(`embed/album/${ALBUM_ID}`, embed({ uri: `spotify:album:${ALBUM_ID}`, name: 'Album from embed', artists: trackEntity.artists.slice(0, 1) }));
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toMatchObject({ albumName: 'Album from embed', albumArtists: [ARTISTS[0]] });
  });

  it('shares concurrent requests, reuses cached pages, and refreshes after expiry', async () => {
    jest.useFakeTimers();
    await Promise.all([subject.fetchSpotifyTrackMetadata(TRACK_ID), subject.fetchSpotifyTrackMetadata(`spotify:track:${TRACK_ID}`)]);
    await subject.fetchSpotifyTrackMetadata(TRACK_ID);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    jest.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await subject.fetchSpotifyTrackMetadata(TRACK_ID);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('does not cache a failed request forever', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toBeNull();
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toMatchObject({ title: TITLE });
  });

  it.each(['headers', 'body'])('bounds a stalled %s request and keeps the successful embed', async (phase) => {
    jest.useFakeTimers();
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.endsWith(`/track/${TRACK_ID}`) && !url.includes('/embed/')
      ? phase === 'headers' ? new Promise(() => {}) : Promise.resolve({ ok: true, url, text: () => new Promise(() => {}) })
      : normalFetch(url, init));
    const pending = subject.fetchSpotifyTrackMetadata(TRACK_ID);
    await jest.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toMatchObject({ title: TITLE, albumName: '', duration_ms: 158250 });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects invalid IDs and mismatched entity or public page identity', async () => {
    await expect(subject.fetchSpotifyTrackMetadata('../album/invalid')).resolves.toBeNull();
    await expect(subject.getSpotifyArtistImage('https://example.com/artist/' + ARTISTS[1].id)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    pages.set(`embed/track/${TRACK_ID}`, embed({ ...trackEntity, uri: `spotify:track:${ALBUM_ID}` }));
    pages.set(`track/${TRACK_ID}`, publicPage('track', ALBUM_ID) + meta('og:title', 'Wrong track'));
    await expect(subject.fetchSpotifyTrackMetadata(TRACK_ID)).resolves.toBeNull();
  });

  it('verifies Rob by Spotify ID and shares the artist profile request', async () => {
    const id = ARTISTS[1].id;
    const image = 'https://i.scdn.co/image/ab6761610000e5ebc788213a195c42e984d3e6a7';
    pages.set(`artist/${id}`, `<link href="${ORIGIN}artist/${id}" rel="canonical"/>` + meta('og:title', 'Rob') + meta('og:image', image));
    await expect(Promise.all([subject.getSpotifyArtistImage(id), subject.getSpotifyArtistImage(id)])).resolves.toEqual([image, image]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'different', 'conflicting'])('rejects an artist image with %s identity', async (identity) => {
    const id = ARTISTS[1].id;
    pages.set(`artist/${id}`, meta('og:image', 'https://i.scdn.co/image/wrong') + (identity === 'missing' ? '' : publicPage('artist', ARTISTS[0].id)) + (identity === 'conflicting' ? `<link rel='canonical' href='${ORIGIN}artist/${id}'/>` : ''));
    await expect(subject.getSpotifyArtistImage(id)).resolves.toBeNull();
  });

  it('keeps playlist metadata out of track album/artwork when enrichment fails', async () => {
    pages.clear();
    pages.set(`embed/playlist/${PLAYLIST_ID}`, embed({ uri: `spotify:playlist:${PLAYLIST_ID}`, name: 'My playlist', visualIdentity: { image: images }, trackList: [{ uri: trackEntity.uri, title: TITLE, subtitle: 'Sotam, Rob', duration: 158250 }] }));
    const result = await subject.fetchSpotifyCollectionMetadata(PLAYLIST_ID, 'playlist');
    expect(result).toMatchObject({ title: 'My playlist', coverUrl: images[2].url, tracks: [{ spotifyId: TRACK_ID, albumName: '', albumId: '', albumArtists: [], imageURL: '', duration_ms: 158250 }] });
  });

  it('uses an album collection as partial fallback without inventing a track/disc number', async () => {
    pages.clear();
    pages.set(`embed/album/${ALBUM_ID}`, embed({ uri: `spotify:album:${ALBUM_ID}`, name: ALBUM_NAME, visualIdentity: { image: images }, trackList: [{ uri: trackEntity.uri, title: TITLE, subtitle: 'Sotam, Rob', duration: 158250 }] }));
    const result = await subject.fetchSpotifyCollectionMetadata(ALBUM_ID, 'album');
    expect(result?.tracks[0]).toMatchObject({ albumName: ALBUM_NAME, albumId: ALBUM_ID, imageURL: images[2].url, duration_ms: 158250 });
    expect(result?.tracks[0]).not.toHaveProperty('trackNumber');
  });
});
