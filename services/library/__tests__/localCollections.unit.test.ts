import {
  getLocalAlbumId,
  groupLocalAlbums,
  groupLocalArtists,
  groupLibraryArtists,
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

  it('shows one recording in every associated release', () => {
    const track = {
      ...tracks[0],
      albumId: 'km2',
      albumName: 'KM2',
      albumAssociations: [
        { id: 'km2', name: 'KM2', imageURL: 'https://image.test/km2.jpg' },
        { id: 'km2-deluxe', name: 'KM2 Deluxe', imageURL: 'https://image.test/km2-deluxe.jpg' },
      ],
    };

    const albums = groupLocalAlbums([track] as any);

    expect(albums).toEqual([
      expect.objectContaining({ id: 'spotify:km2', title: 'KM2', tracks: [expect.objectContaining({ spotifyId: 'first' })] }),
      expect.objectContaining({ id: 'spotify:km2-deluxe', title: 'KM2 Deluxe', tracks: [expect.objectContaining({ spotifyId: 'first' })] }),
    ]);
  });
});

describe('groupLocalArtists', () => {
  it('limits library artists to primary credits and follows, preserving complete credits elsewhere', () => {
    const tracks = [{ spotifyId: 'one', artistName: 'Ebony, Rob', artists: [
      { id: 'ebony', name: 'Ebony' }, { id: 'rob', name: 'Rob' },
    ], albumName: 'Album', albumArtists: [{ id: 'album-owner', name: 'Album Owner' }] }];
    const followed = [{ id: 'ytartist_sotam', name: 'Sotam', imageURL: 'portrait.jpg', followedAt: 1 },
      { id: 'ytartist_ebony', name: 'Ebony', imageURL: 'ebony.jpg', followedAt: 2 }];
    const artists = groupLibraryArtists(tracks as any, followed);
    expect(artists.map((item) => item.title)).toEqual(['Ebony', 'Sotam', 'Album Owner']);
    expect(artists[0]).toMatchObject({ routeId: 'ytartist_ebony', following: true, imageURL: 'ebony.jpg' });
    expect(artists[1].tracks).toEqual([]);
    expect(groupLocalArtists(tracks as any).map((item) => item.title)).toContain('Rob');
    expect(groupLibraryArtists(tracks as any, []).map((item) => item.title)).not.toContain('Sotam');
  });
  it('uses verified identities without splitting names containing punctuation', () => {
    const artists = groupLocalArtists([
      { spotifyId: 'one', artistName: 'A & B, Rob', artists: [
        { id: 'duo', name: 'A & B' }, { id: 'rob-1', name: 'Rob' },
      ] },
      { spotifyId: 'two', artistName: 'Rob', artists: [{ id: 'rob-2', name: 'Rob' }] },
    ] as any);
    expect(artists.map((artist) => artist.id)).toEqual(['a & b', 'rob']);
    expect(artists[0]).toMatchObject({ title: 'A & B', spotifyArtistId: 'duo' });
    expect(artists[1].tracks.map((track) => track.spotifyId)).toEqual(['one', 'two']);
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
