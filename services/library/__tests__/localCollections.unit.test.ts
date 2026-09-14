import {
  getLocalAlbumId,
  groupLocalAlbums,
  groupLocalArtists,
} from '../localCollections';

describe('groupLocalAlbums', () => {
  const tracks = [
    {
      spotifyId: 'first',
      title: 'Primeira',
      artistName: 'Artista',
      albumName: 'Disco',
      imageURL: 'https://image.test/first.jpg',
      localImagePath: 'file:///covers/first.jpg',
    },
    {
      spotifyId: 'second',
      title: 'Segunda',
      artistName: 'Artista',
      albumName: 'Disco',
      imageURL: 'https://image.test/second.jpg',
      localImagePath: 'file:///covers/second.jpg',
    },
  ];

  it('keeps all tracks from the same local album in one collection', () => {
    const albums = groupLocalAlbums(tracks as any);

    expect(albums).toEqual([
      expect.objectContaining({
        id: getLocalAlbumId(tracks[0] as any),
        title: 'Disco',
        subtitle: 'Artista',
        imageURL: 'file:///covers/first.jpg',
        tracks,
      }),
    ]);
  });

  it('uses Singles when a downloaded track has no album name', () => {
    expect(
      getLocalAlbumId({ ...tracks[0], albumName: '  ' } as any)
    ).toBe('singles\u0000artista');
  });

  it('groups featured credits by album identity and preserves album track order', () => {
    const artists = [{ id: 'sotam', name: 'Sotam' }, { id: 'rob', name: 'Rob' }];
    const albums = groupLocalAlbums([
      { ...tracks[0], albumId: 'ep', albumArtists: artists, artistName: 'Sotam, Rob, Carla Sol', trackNumber: 2 },
      { ...tracks[1], albumId: 'ep', albumArtists: artists, artistName: 'Sotam, Rob, Matheus Muniz', trackNumber: 1 },
    ] as any);
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({ id: 'spotify:ep', subtitle: 'Sotam, Rob' });
    expect(albums[0].tracks.map((track) => track.spotifyId)).toEqual(['second', 'first']);
  });

  it('does not split legacy albums by guests or merge distinct Spotify releases', () => {
    expect(groupLocalAlbums([
      { ...tracks[0], artistName: 'Artista, Convidado A' },
      { ...tracks[1], artistName: 'Artista, Convidado B' },
    ] as any)).toHaveLength(1);
    expect(groupLocalAlbums([
      { ...tracks[0], albumId: 'release-1' },
      { ...tracks[1], albumId: 'release-2' },
    ] as any)).toHaveLength(2);
  });
});

describe('groupLocalArtists', () => {
  it('uses verified identities without splitting names containing punctuation', () => {
    const artists = groupLocalArtists([
      { spotifyId: 'one', artistName: 'A & B, Rob', artists: [
        { id: 'duo', name: 'A & B' }, { id: 'rob-1', name: 'Rob' },
      ] },
      { spotifyId: 'two', artistName: 'Rob', artists: [{ id: 'rob-2', name: 'Rob' }] },
    ] as any);
    expect(artists.map((artist) => artist.id)).toEqual(['spotify:duo', 'spotify:rob-1', 'spotify:rob-2']);
    expect(artists[0]).toMatchObject({ title: 'A & B', spotifyArtistId: 'duo' });
  });
  it('groups collaboration credits under each artist', () => {
    const artistTracks = [
      {
        spotifyId: 'first',
        title: 'Primeira',
        artistName: 'Artista, Convidado',
        albumName: 'Disco',
        imageURL: 'https://image.test/first.jpg',
        localImagePath: 'file:///covers/first.jpg',
      },
      {
        spotifyId: 'second',
        title: 'Segunda',
        artistName: 'Artista',
        albumName: 'Disco',
        imageURL: 'https://image.test/second.jpg',
        localImagePath: 'file:///covers/second.jpg',
      },
    ];
    const artists = groupLocalArtists([
      ...artistTracks,
    ] as any);

    expect(artists).toEqual([
      expect.objectContaining({
        id: 'artista',
        title: 'Artista',
        imageURL: '',
        tracks: expect.arrayContaining([
          expect.objectContaining({ spotifyId: 'first' }),
          expect.objectContaining({ spotifyId: 'second' }),
        ]),
      }),
      expect.objectContaining({
        id: 'convidado',
        title: 'Convidado',
        imageURL: '',
        tracks: [expect.objectContaining({ spotifyId: 'first' })],
      }),
    ]);
  });
});
