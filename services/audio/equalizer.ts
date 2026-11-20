import type { AppSettings } from '../settings/appSettings';

export const EQUALIZER_FREQUENCIES = [60, 150, 400, 1000, 2500, 6000, 14000];
export const EQUALIZER_PRESETS = {
  Neutro: [0, 0, 0, 0, 0, 0, 0],
  Graves: [6, 4, 1, 0, 0, 0, 0],
  Voz: [-2, -1, 1, 3, 3, 1, -1],
  Brilho: [-1, 0, 0, 0, 2, 4, 5],
  Suave: [2, 1, 0, -1, -2, -2, -3],
};

export type EqualizerFilter = { frequency: number; gain: number; q: number; kind: 0 | 1 | 2 };
export const equalizerFilters = (settings: AppSettings): EqualizerFilter[] => {
  if (!settings.equalizerEnabled) return [];
  const filters: EqualizerFilter[] = settings.equalizerMode === 'tone'
    ? [{ frequency: 250, gain: -settings.equalizerToneX * 1.2, q: 1, kind: 1 },
      { frequency: 1000, gain: settings.equalizerToneY * 1.2, q: settings.equalizerFocused ? 1.5 : 0.6, kind: 0 },
      { frequency: 4000, gain: settings.equalizerToneX * 1.2, q: 1, kind: 2 }]
    : EQUALIZER_FREQUENCIES.map((frequency, index) => ({ frequency,
      gain: settings.equalizerBands[index] || 0, q: 1, kind: index === 0 ? 1 : index === 6 ? 2 : 0 }));
  return filters.filter((filter) => Math.abs(filter.gain) > 0.001);
};

/** Normalized RBJ coefficients, following https://www.w3.org/TR/audio-eq-cookbook/. */
export const biquadCoefficients = (filter: EqualizerFilter, sampleRate: number): number[] => {
  const a = 10 ** (filter.gain / 40);
  const omega = 2 * Math.PI * Math.min(filter.frequency, sampleRate * 0.45) / sampleRate;
  const c = Math.cos(omega), s = Math.sin(omega);
  const alpha = s / (2 * filter.q);
  const beta = s * Math.sqrt(2 * a); // Shelves use a monotonic slope of 1.
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (filter.kind === 1) {
    b0 = a * ((a + 1) - (a - 1) * c + beta); b1 = 2 * a * ((a - 1) - (a + 1) * c);
    b2 = a * ((a + 1) - (a - 1) * c - beta); a0 = (a + 1) + (a - 1) * c + beta;
    a1 = -2 * ((a - 1) + (a + 1) * c); a2 = (a + 1) + (a - 1) * c - beta;
  } else if (filter.kind === 2) {
    b0 = a * ((a + 1) + (a - 1) * c + beta); b1 = -2 * a * ((a - 1) + (a + 1) * c);
    b2 = a * ((a + 1) + (a - 1) * c - beta); a0 = (a + 1) - (a - 1) * c + beta;
    a1 = 2 * ((a - 1) - (a + 1) * c); a2 = (a + 1) - (a - 1) * c - beta;
  } else {
    b0 = 1 + alpha * a; b1 = -2 * c; b2 = 1 - alpha * a;
    a0 = 1 + alpha / a; a1 = -2 * c; a2 = 1 - alpha / a;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
};

export const filterResponseDb = (coefficients: number[], frequency: number, sampleRate: number) => {
  const [b0, b1, b2, a1, a2] = coefficients;
  const omega = 2 * Math.PI * frequency / sampleRate;
  const power = (x: number, y: number, z: number) =>
    (x + y * Math.cos(omega) + z * Math.cos(2 * omega)) ** 2 +
    (y * Math.sin(omega) + z * Math.sin(2 * omega)) ** 2;
  return 10 * Math.log10(power(b0, b1, b2) / power(1, a1, a2));
};

export const equalizerHeadroomDb = (filters: EqualizerFilter[]) => {
  if (!filters.length) return 0;
  let peak = 0;
  for (const rate of [32000, 44100, 48000, 96000]) {
    const coefficients = filters.map((filter) => biquadCoefficients(filter, rate));
    for (let point = 0; point <= 192; point++) {
      const frequency = 20 * (rate * 0.49 / 20) ** (point / 192);
      peak = Math.max(peak, coefficients.reduce((sum, band) => sum + filterResponseDb(band, frequency, rate), 0));
    }
  }
  return peak > 0.01 ? -(peak + 0.5) : 0;
};

/** Small immutable control packet. Native decoders own all sample processing. */
export const equalizerPacket = (settings: AppSettings): number[] => {
  const filters = equalizerFilters(settings);
  return [10 ** (equalizerHeadroomDb(filters) / 20), settings.audioBalance,
    ...filters.flatMap(({ frequency, gain, q, kind }) => [frequency, gain, q, kind])];
};
export const needsEqualizerProcessing = (packet: number[]) => packet.length > 2 || packet[1] !== 0;
