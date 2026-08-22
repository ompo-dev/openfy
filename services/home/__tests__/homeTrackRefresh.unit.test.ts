jest.mock('../../audio/audioResolver', () => ({
  resolveAudioUrl: jest.fn(),
}));

import { refreshHomeTracks } from '../homeTrackRefresh';
import { resolveAudioUrl } from '../../audio/audioResolver';

const resolveAudioUrlMock = resolveAudioUrl as jest.Mock;

describe('refreshHomeTracks', () => {
  beforeEach(() => {
    resolveAudioUrlMock.mockReset();
  });

  it('uses canonical metadata and a playable stream for every matching Home card', async () => {
    resolveAudioUrlMock.mockResolvedValue({
      url: 'https://media.test/track.m4a',
      imageURL: 'https://images.test/cover.jpg',
    });

    const onTrackResolved = jest.fn();
    const refreshed = await refreshHomeTracks(
      [
        {
          key: 'home-card',
          spotifyId: 'source-id',
          title: 'Título original',
          artistName: 'Artista original',
          albumName: 'Single',
          imageURL: '',
          duration_ms: 180000,
        },
      ],
      onTrackResolved
    );

    expect(resolveAudioUrlMock).toHaveBeenCalledWith(
      'Título original',
      'Artista original',
      'source-id',
      180000
    );
    expect(refreshed).toEqual({
      'home-card': expect.objectContaining({
        spotifyId: 'source-id',
        title: 'Título original',
        artistName: 'Artista original',
        albumName: 'Single',
        imageURL: 'https://images.test/cover.jpg',
        duration_ms: 180000,
        streamUrl: 'https://media.test/track.m4a',
        streamExpiresAt: expect.any(Number),
      }),
    });
    expect(onTrackResolved).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'home-card' }),
      expect.objectContaining({
        streamUrl: 'https://media.test/track.m4a',
      })
    );
  });

  it('does not replace the visible card when its audio source cannot be verified', async () => {
    resolveAudioUrlMock.mockResolvedValue(null);

    await expect(
      refreshHomeTracks([
        {
          key: 'unverified',
          spotifyId: 'source-id',
          title: 'Título',
          artistName: 'Artista',
          albumName: 'Single',
          imageURL: '',
          duration_ms: 180000,
        },
      ])
    ).resolves.toEqual({});
  });
});
