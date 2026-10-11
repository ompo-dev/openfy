import { getYouTubeMusicClient, toYouTubeMusicArtistRouteId } from '../../youtubeMusicClient';
import { personalizeArtistSearch, resolveTrackArtist } from '../artistIdentity';
import type { ArtistModel } from '@models';

jest.mock('../../youtubeMusicClient', () => ({
  ...jest.requireActual('../../youtubeMusicClient'),
  getYouTubeMusicClient: jest.fn(),
}));

const sid = toYouTubeMusicArtistRouteId(`UC${'s'.repeat(22)}`, 'Sid');
const band = toYouTubeMusicArtistRouteId(`UC${'b'.repeat(22)}`, 'SID');

describe('artist identities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves a real Spotify or YouTube credit instead of searching its name', async () => {
    for (const id of [sid, '1234567890123456789012']) {
      expect(await resolveTrackArtist({ id, name: 'Sid' })).toEqual({ id, name: 'Sid' });
    }
    expect(getYouTubeMusicClient).not.toHaveBeenCalled();
  });

  it('resolves a missing identity from the recording credits rather than a homonymous name', async () => {
    const search = jest.fn().mockResolvedValue({ songs: { contents: [{
      title: 'Jogador Numero 1', artists: [
        { channel_id: `UC${'m'.repeat(22)}`, name: '7 Minutoz' },
        { channel_id: `UC${'s'.repeat(22)}`, name: 'Sid' },
      ],
    }] } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search } } as never);
    expect(await resolveTrackArtist({ name: 'Sid' }, { title: 'Jogador Numero 1',
      artists: [{ name: '7 Minutoz' }, { name: 'Sid' }] })).toEqual({ id: sid, name: 'Sid' });
    expect(search).toHaveBeenCalledWith('Jogador Numero 1 7 Minutoz Sid', { type: 'song' });
  });

  it('ranks the listened identity first but retains the other homonymous profile', async () => {
    const results: ArtistModel[] = [{ type: 'artist', id: band, name: 'SID', imageURL: 'band.jpg' }];
    const ranked = await personalizeArtistSearch('sid', results, { tracks: [{ title: 'Outra',
      artists: [{ id: sid, name: 'Sid' }] }] });
    expect(ranked.map((artist) => artist.id)).toEqual([sid, band]);
    expect(ranked[0].imageURL).not.toBe('band.jpg');
  });

  it('keeps both exact-name results when there is no personal context', async () => {
    const results: ArtistModel[] = [sid, band].map((id) => ({ type: 'artist', id, name: 'Sid', imageURL: '' }));
    expect(await personalizeArtistSearch('sid', results)).toEqual(results);
  });

  it('does not accept a credit from a different song when only the artist name matches', async () => {
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search: jest.fn().mockResolvedValue({
      songs: { contents: [{ title: 'Outra musica', artists: [{ name: 'Sid', channel_id: `UC${'b'.repeat(22)}` }] }] },
    }) } } as never);
    const result = await resolveTrackArtist({ name: 'Sid' }, { title: 'Isso Vale Minha Vida', artistName: 'Sid, Tavin' });
    expect(result.id).toBe(toYouTubeMusicArtistRouteId(undefined, 'Sid'));
  });

  it('requires a matching collaborator when homonyms share the same song title', async () => {
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search: jest.fn().mockResolvedValue({
      songs: { contents: [
        { title: 'Dueto', artists: [{ name: 'Sid', channel_id: `UC${'b'.repeat(22)}` }, { name: 'Other' }] },
        { title: 'Dueto', artists: [{ name: 'Sid', channel_id: `UC${'s'.repeat(22)}` }, { name: 'Tavin' }] },
      ] },
    }) } } as never);
    expect(await resolveTrackArtist({ name: 'Sid' }, { title: 'Dueto', artistName: 'Sid, Tavin' }))
      .toEqual({ id: sid, name: 'Sid' });
  });

  it('resolves a combined lead credit only after confirming the channel profile', async () => {
    const channel = `UC${'s'.repeat(22)}`;
    const search = jest.fn().mockResolvedValue({ songs: { contents: [{
      title: 'Combined credit song', artists: [{ name: 'Sid & Tavin', channel_id: channel }],
    }] } });
    const getArtist = jest.fn().mockResolvedValue({ header: { title: 'Sid' } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: { search, getArtist } } as never);

    expect(await resolveTrackArtist({ name: 'Sid' }, {
      title: 'Combined credit song', artists: [{ name: 'Sid' }, { name: 'Tavin' }],
    })).toEqual({ id: sid, name: 'Sid' });
    expect(getArtist).toHaveBeenCalledWith(channel);
  });

  it('does not assign a combined duo profile to one of its members', async () => {
    const getArtist = jest.fn().mockResolvedValue({ header: { title: 'Sid & Tavin' } });
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      search: jest.fn().mockResolvedValue({ songs: { contents: [{
        title: 'Duo credit song', artists: [{ name: 'Sid & Tavin', channel_id: `UC${'b'.repeat(22)}` }],
      }] } }), getArtist,
    } } as never);

    expect(await resolveTrackArtist({ name: 'Sid' }, {
      title: 'Duo credit song', artistName: 'Sid, Tavin',
    })).toEqual({ id: toYouTubeMusicArtistRouteId(undefined, 'Sid'), name: 'Sid' });
  });

  it('does not give the lead channel to a secondary collaborator in a combined credit', async () => {
    const getArtist = jest.fn();
    jest.mocked(getYouTubeMusicClient).mockResolvedValue({ music: {
      search: jest.fn().mockResolvedValue({ songs: { contents: [{
        title: 'Secondary credit song', artists: [{ name: 'Sid & Tavin', channel_id: `UC${'s'.repeat(22)}` }],
      }] } }), getArtist,
    } } as never);

    expect(await resolveTrackArtist({ name: 'Tavin' }, {
      title: 'Secondary credit song', artistName: 'Sid, Tavin',
    })).toEqual({ id: toYouTubeMusicArtistRouteId(undefined, 'Tavin'), name: 'Tavin' });
    expect(getArtist).not.toHaveBeenCalled();
  });
});
