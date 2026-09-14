import { parseYouTubeCount, rankYouTubeCandidate, type YouTubeCandidate } from '../youtubeCandidateRanking';

const canonical = { spotifyId: '7LQas0ePVqtRXHzopsCY5a', title: 'Taros',
  artists: ['Pedro Qualy', 'Sotam', '013VG', 'Riff'], durationMs: 269785 };
const official: YouTubeCandidate = { videoId: 'LIXckjwbPdY',
  title: 'Pedro Qualy & Sotam - Taros (Prod. Vg & Riff)', artist: 'HAIKAISS OFICIAL',
  durationMs: 270000, isOfficialArtistChannel: true, viewCount: 486390, subscriberCount: 3430000 };

describe('YouTube candidate ranking', () => {
  it('prefers the official group publisher over a same-name fan account', () => {
    const fan = { ...official, artist: 'Pedro Qualy', isOfficialArtistChannel: false,
      viewCount: 500, subscriberCount: 120, durationMs: 269785 };
    const result = rankYouTubeCandidate(official, canonical);
    expect(result.eligible).toBe(true);
    expect(result.rank).toBeGreaterThan(rankYouTubeCandidate(fan, canonical).rank);
  });

  it('never treats a matching display name or the word official as a badge', () => {
    const result = rankYouTubeCandidate({ ...official, artist: 'Pedro Qualy Official',
      isOfficialArtistChannel: false }, canonical);
    expect(result.authority).toBe(0);
    expect(result.match.reasons).not.toContain('YouTube Official Artist Channel badge');
  });

  it('audience only breaks ties, without making an unrelated upload eligible', () => {
    const large = { ...official, isOfficialArtistChannel: false, viewCount: 2e9, subscriberCount: 1e8 };
    expect(rankYouTubeCandidate(large, canonical).eligible).toBe(false);
    expect(rankYouTubeCandidate({ ...official, title: 'Different song' }, canonical).eligible).toBe(false);
    expect(rankYouTubeCandidate({ ...official, title: 'Taros', artist: 'Other Artist' }, canonical).eligible).toBe(false);
    expect(rankYouTubeCandidate({ ...official, durationMs: 350000 }, canonical).eligible).toBe(false);
  });

  it('rejects reactions, live streams, fan channels, and unwanted alternative versions', () => {
    for (const override of [
      { title: `${official.title} REACTION` }, { title: `${official.title} (Cover)` },
      { title: `${official.title} (Slowed)` }, { isLive: true }, { isUpcoming: true },
      { artist: 'Pedro Qualy Fans' },
    ]) expect(rankYouTubeCandidate({ ...official, ...override }, canonical).eligible).toBe(false);
  });

  it('uses subscriber and view counts to break equally trustworthy ties', () => {
    const small = rankYouTubeCandidate({ ...official, viewCount: 20, subscriberCount: 10 }, canonical);
    expect(rankYouTubeCandidate(official, canonical).rank).toBeGreaterThan(small.rank);
  });

  it.each([
    ['486,390 views', 486390], ['486.390 visualizacoes', 486390], ['3.43M subscribers', 3430000],
    ['3,43 mi subscribers', 3430000], ['204K subscribers', 204000], ['1,2 mil inscritos', 1200],
    ['1.2 million subscribers', 1200000], ['No views', undefined], ['', undefined],
  ])('parses count %s', (text, expected) => expect(parseYouTubeCount(text)).toBe(expected));
});
