import { DEFAULT_APP_SETTINGS } from '../../settings/appSettings';
import { biquadCoefficients, equalizerFilters, equalizerHeadroomDb, equalizerPacket, filterResponseDb } from '../equalizer';

describe('equalizer control contract', () => {
  it('leaves default output unchanged and does not filter when off', () => {
    expect(equalizerPacket(DEFAULT_APP_SETTINGS)).toEqual([1, 0]);
    expect(equalizerFilters({ ...DEFAULT_APP_SETTINGS, equalizerBands: [12, 12, 12, 12, 12, 12, 12] })).toEqual([]);
  });
  it('hits the requested peak gain at the band center on different sample rates', () => {
    for (const rate of [22050, 32000, 44100, 48000, 96000]) {
      const c = biquadCoefficients({ frequency: 1000, gain: 6, q: 1, kind: 0 }, rate);
      expect(filterResponseDb(c, 1000, rate)).toBeCloseTo(6, 6);
      expect(c.every(Number.isFinite)).toBe(true);
    }
  });
  it('boost and cut at the same peak frequency cancel', () => {
    const boost = biquadCoefficients({ frequency: 150, gain: 12, q: 1, kind: 0 }, 48000);
    const cut = biquadCoefficients({ frequency: 150, gain: -12, q: 1, kind: 0 }, 48000);
    for (const frequency of [30, 60, 150, 300, 1000, 10000]) {
      expect(filterResponseDb(boost, frequency, 48000) + filterResponseDb(cut, frequency, 48000)).toBeCloseTo(0, 6);
    }
  });
  it('compensates overlapping bands to keep the steady-state response below clipping', () => {
    const filters = equalizerFilters({ ...DEFAULT_APP_SETTINGS, equalizerEnabled: true,
      equalizerBands: [12, 12, 12, 12, 12, 12, 12] });
    const compensation = equalizerHeadroomDb(filters);
    expect(compensation).toBeLessThan(-12);
    for (const frequency of [20, 60, 150, 400, 1000, 2500, 6000, 14000, 20000]) {
      const gain = filters.reduce((sum, band) => sum + filterResponseDb(biquadCoefficients(band, 48000), frequency, 48000), 0);
      expect(gain + compensation).toBeLessThan(0);
    }
  });
  it('preserves manual settings when using tone and allows balance independently', () => {
    const settings = { ...DEFAULT_APP_SETTINGS, equalizerEnabled: true, equalizerMode: 'tone' as const,
      equalizerToneX: 5, equalizerToneY: 3, equalizerFocused: true, audioBalance: -1 };
    expect(equalizerFilters(settings)).toMatchObject([{ gain: -6, kind: 1 }, { q: 1.5 }, { gain: 6, kind: 2 }]);
    expect(equalizerFilters(settings)[1].gain).toBeCloseTo(3.6);
    expect(equalizerPacket(settings)[1]).toBe(-1);
    expect(settings.equalizerBands).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
