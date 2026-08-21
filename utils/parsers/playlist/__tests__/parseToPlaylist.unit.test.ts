import { parseToPlaylist } from '../parseToPlaylist';

describe('parseToPlaylist', () => {
  it('aceita playlist sem capa', () => {
    const playlist = parseToPlaylist({
      type: 'playlist',
      id: 'playlist-1',
      collaborative: false,
      description: 'Descrição',
      href: '',
      images: [],
      name: 'Sem capa',
      owner: { display_name: 'Usuário', href: '', id: 'user-1', type: 'user', uri: '' },
      primary_color: null,
      public: true,
      snapshot_id: '',
      followers: { total: 10 },
      tracks: { total: 0, next: '', items: [] },
      uri: '',
    });

    expect(playlist.imageURL).toBe('');
    expect(playlist.info).toBe('10 saves');
  });
});
