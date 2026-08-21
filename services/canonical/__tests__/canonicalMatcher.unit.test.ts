import {
  evaluateCandidateMatch,
  hasConflictingNumberedTitleInLyrics,
  hasCanonicalTitleMatch,
} from '../canonicalMatcher';

describe('evaluateCandidateMatch', () => {
  const canonical = {
    title: 'Blinding Lights',
    artists: ['The Weeknd'],
    durationMs: 200000,
    spotifyId: 'spotify-track-id',
  };

  it('rejects a same-duration song from a different artist', () => {
    const result = evaluateCandidateMatch(
      {
        title: 'Blinding Lights',
        artist: 'Another Artist',
        durationMs: 200000,
        provider: 'soundcloud',
        url: 'https://soundcloud.com/another-artist/blinding-lights',
        playbackCount: 1000000,
      },
      canonical
    );

    expect(result.isVerified).toBe(false);
    expect(result.status).toBe('unavailable');
  });

  it('verifies the canonical song when title, artist, and duration agree', () => {
    const result = evaluateCandidateMatch(
      {
        title: 'The Weeknd - Blinding Lights (Official Audio)',
        artist: 'The Weeknd',
        durationMs: 200000,
        provider: 'youtube',
        url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
        viewCount: 4000000000,
      },
      canonical
    );

    expect(result.isVerified).toBe(true);
    expect(result.status).toBe('verified');
  });

  it('rejects a numbered continuation with the same artist and duration', () => {
    const result = evaluateCandidateMatch(
      {
        title: 'Sidoka - Pique Narutão 2 (Official Audio)',
        artist: 'Sidoka',
        durationMs: 180000,
        provider: 'youtube',
        url: 'https://www.youtube.com/watch?v=wrong-track',
        viewCount: 1000000,
      },
      {
        title: 'Pique Narutão',
        artists: ['Sidoka'],
        durationMs: 180000,
        spotifyId: 'pique-narutao',
      }
    );

    expect(result.isVerified).toBe(false);
    expect(result.status).toBe('unavailable');
  });

  it('keeps a numbered sequel selectable as its own canonical track', () => {
    expect(
      hasCanonicalTitleMatch(
        'Sidoka - Pique Narutão 2 (Official Audio)',
        'Pique Narutão 2'
      )
    ).toBe(true);
    expect(hasCanonicalTitleMatch('Pique Narutão', 'Pique Narutão 2')).toBe(
      false
    );
    expect(hasCanonicalTitleMatch('Pique Narutão (2)', 'Pique Narutão')).toBe(
      false
    );
    expect(
      hasCanonicalTitleMatch('Pique Narutão (2)', 'Pique Narutão 2')
    ).toBe(true);
  });

  it('allows unrelated numeric production credits after an exact title', () => {
    expect(
      hasCanonicalTitleMatch(
        'JOGADOR NÚMERO 1 - Lucas A.R.T. [Prod. 808 Ander]',
        'Jogador Número 1'
      )
    ).toBe(true);
  });

  it('allows official metadata inserted between title words', () => {
    expect(
      hasCanonicalTitleMatch(
        'Rap do Thorfinn (Vinland Saga) | Conto de Vingança | Enygma 75',
        'Rap do Thorfinn: Conto de Vingança'
      )
    ).toBe(true);
  });

  it('rejects only conflicting numbered lyrics after stripping LRC timestamps', () => {
    expect(
      hasConflictingNumberedTitleInLyrics(
        '[00:04.10] Você sabe quem é o narutão',
        'Pique Narutão'
      )
    ).toBe(false);
    expect(
      hasConflictingNumberedTitleInLyrics(
        'Alô, é da pizzaria do Sid? Queria ouvir um Pique Narutão 2',
        'Pique Narutão'
      )
    ).toBe(true);
    expect(
      hasConflictingNumberedTitleInLyrics(
        'Alô, é da pizzaria do Sid? Queria ouvir um Pique Narutão 2',
        'Pique Narutão 2'
      )
    ).toBe(false);
  });
});
