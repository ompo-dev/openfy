import { formatCollectionMeta } from '../collectionPresentation';

describe('formatCollectionMeta', () => {
  it('combina criação, quantidade e duração sem inventar campos ausentes', () => {
    expect(
      formatCollectionMeta({
        createdAt: '2025-12-01T12:00:00.000Z',
        trackCount: 36,
        totalDurationMs: 4_800_000,
      })
    ).toBe('1 dez. 2025 • 36 músicas • 1h 20min');
  });

  it('mostra somente dados disponíveis', () => {
    expect(formatCollectionMeta({ trackCount: 1, totalDurationMs: 0 })).toBe(
      '1 música'
    );
  });
});
