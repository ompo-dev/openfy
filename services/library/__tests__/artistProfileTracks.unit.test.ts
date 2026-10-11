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
  it('does not add another artist with the same name but a different stable identity', () => {
    const artistId = '1234567890123456789012';
    const result = mergeArtistProfileTracks({ artistId, artistName: 'Sid', primaryTracks: [], participationTracks: [],
      contextualTracks: [track('right-song', 'Correct', [{ id: artistId, name: 'Sid' }]),
        track('wrong-song', 'Other', [{ id: '1234567890123456789013', name: 'SID' }])],
    });
    expect(result.primaryTracks.map((item) => item.id)).toEqual(['right-song']);
  });

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
    expect(result.participationTracks[0].id).toBe('spotify_track');
  });

  it('keeps catalogue order and appends only contextual tracks not in the catalogue', () => {
    const catalogFirst = track('catalog_first', 'First', [
      { id: 'pedro', name: 'Pedro Qualy' },
    ]);
    const catalogSecond = track('catalog_second', 'Second', [
      { id: 'pedro', name: 'Pedro Qualy' },
    ]);
    const contextual = track('contextual', 'Contextual', [
      { id: 'pedro', name: 'Pedro Qualy' },
    ]);

    const result = mergeArtistProfileTracks({
      artistId: 'pedro',
      artistName: 'Pedro Qualy',
      contextualTracks: [contextual, catalogFirst],
      primaryTracks: [catalogFirst, catalogSecond],
      participationTracks: [],
    });

    expect(result.primaryTracks.map((item) => item.id)).toEqual([
      'catalog_first',
      'catalog_second',
      'contextual',
    ]);
  });

  it('merges alternate release memberships for the same recording', () => {
    const result = mergeArtistProfileTracks({
      artistId: 'ebony',
      artistName: 'Ebony',
      contextualTracks: [],
      participationTracks: [],
      primaryTracks: [
        {
          ...track('km2-copy', 'KIA', [{ id: 'ebony', name: 'Ebony' }]),
          albumId: 'km2',
          albumName: 'KM2',
          albumAssociations: [{ id: 'km2', name: 'KM2' }],
        },
        {
          ...track('deluxe-copy', 'KIA', [{ id: 'ebony', name: 'Ebony' }]),
          albumId: 'km2-deluxe',
          albumName: 'KM2 Deluxe',
          albumAssociations: [{ id: 'km2-deluxe', name: 'KM2 Deluxe' }],
        },
      ],
    });

    expect(result.primaryTracks).toHaveLength(1);
    expect(result.primaryTracks[0].albumAssociations).toEqual([
      expect.objectContaining({ id: 'km2', name: 'KM2' }),
      expect.objectContaining({ id: 'km2-deluxe', name: 'KM2 Deluxe' }),
    ]);
  });
});
