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
});

describe('groupLocalArtists', () => {
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
