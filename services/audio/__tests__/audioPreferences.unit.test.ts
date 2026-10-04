import { audioQualityCacheKey, streamSelectionQuality } from '../audioPreferences';

describe('audio preference policy', () => {
  it('maps preferences to the real youtubei format selector', () => {
    expect(streamSelectionQuality('high')).toBe('best');
    expect(streamSelectionQuality('economy')).toBe('bestefficiency');
  });

  it('keeps preloads and resolutions separated by source quality', () => {
    expect(audioQualityCacheKey('track', 'high')).not.toBe(audioQualityCacheKey('track', 'economy'));
    expect(audioQualityCacheKey('other-track', 'high')).not.toBe(audioQualityCacheKey('track', 'high'));
  });
});
