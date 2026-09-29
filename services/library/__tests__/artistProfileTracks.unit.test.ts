import { mergeArtistProfileTracks } from '../artistProfileTracks';

const track = (
  id: string,
  title: string,
  artists: { id: string; name: string }[]
) => ({
  id,
  title,
  subtitle: artists.map((artist) => artist.name).join(', '),
  artists,
});

describe('mergeArtistProfileTracks', () => {
  it('includes a streamed contextual track in the primary artist profile', () => {
    const result = mergeArtistProfileTracks({
      artistId: 'pedro',
      artistName: 'Pedro Qualy',
      contextualTracks: [
        track('yt_stream', 'Tarôs', [
          { id: 'pedro', name: 'Pedro Qualy' },
          { id: 'sotam', name: 'Sotam' },
        ]),
      ],
      primaryTracks: [],
      participationTracks: [],
    });

    expect(result.primaryTracks.map((item) => item.id)).toEqual(['yt_stream']);
  });

  it('places collaborations under participations and removes provider duplicates', () => {
    const youtubeCopy = track('yt_stream', 'Tarôs', [
      { id: 'pedro', name: 'Pedro Qualy' },
      { id: '', name: 'Sotam' },
    ]);
    const spotifyCopy = track('spotify_track', 'Tarôs', [
      { id: 'pedro', name: 'Pedro Qualy' },
      { id: 'sotam', name: 'Sotam' },
    ]);
    const result = mergeArtistProfileTracks({
      artistId: 'sotam',
      artistName: 'Sotam',
      contextualTracks: [youtubeCopy],
      primaryTracks: [],
      participationTracks: [spotifyCopy],
    });

    expect(result.primaryTracks).toEqual([]);
    expect(result.participationTracks).toHaveLength(1);
    expect(result.participationTracks[0].id).toBe('yt_stream');
  });
});
