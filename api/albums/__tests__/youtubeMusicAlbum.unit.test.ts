import { getYouTubeMusicAlbum } from '../youtubeMusicAlbum';
import { getYouTubeMusicClient } from '../../../services/youtubeMusicClient';
import { rememberAlbumMetadata } from '../../../services/library/albumMetadata';

jest.mock('../../../services/youtubeMusicClient', () => ({
  ...jest.requireActual('../../../services/youtubeMusicClient'),
  getYouTubeMusicClient: jest.fn(),
}));
jest.mock('../../../services/library/albumMetadata', () => ({ rememberAlbumMetadata: jest.fn().mockResolvedValue(undefined) }));

it('loads all 11 KM2 members and shares album identity/artwork instead of a library subset', async () => {
  const titles = ['KM2', 'Parte do Mundo', 'Gin Com Suco De Laranja', 'Festas e Manequins', 'Vale Do Silicio', 'Hong He', 'Extraordinaria', 'Nao Lembro Da Minha Infancia', 'Triplex', 'KIA', 'Roubando Livros'];
  const getAlbum = jest.fn().mockResolvedValue({
    header: {
      title: { text: 'KM2' }, subtitle: { text: 'Album 2025' }, second_subtitle: { text: '11 songs' },
      thumbnail: { contents: [{ url: 'https://images.test/km2.jpg', width: 720 }] },
      strapline_text_one: { runs: [{ text: 'Ebony', endpoint: { payload: { browseId: 'UCebony' } } }] },
    },
    contents: titles.map((title, index) => ({
      id: `video${String(index).padStart(6, '0')}`, title, duration: { seconds: 120 },
      ...(index ? { authors: [{ channel_id: 'UCebony', name: 'Ebony' }] } : {}),
    })),
  });
  jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { getAlbum } } as never);
  const album = await getYouTubeMusicAlbum('ytalbum_MPREb_FtAdim6ouGM');
  expect(getAlbum).toHaveBeenCalledWith('MPREb_FtAdim6ouGM');
  expect(album.tracks.map((track) => track.title)).toEqual(titles);
  album.tracks.forEach((track, index) => expect(track).toMatchObject({
    albumId: 'MPREb_FtAdim6ouGM', albumName: 'KM2', trackNumber: index + 1,
    imageURL: 'https://images.test/km2.jpg',
    albumArtists: [{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }],
    artists: [{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }],
  }));
  expect(album.artists).toEqual([{ id: 'ytartist_UCebony~Ebony', name: 'Ebony' }]);
  expect(rememberAlbumMetadata).toHaveBeenCalledWith(album);
});
