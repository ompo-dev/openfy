import { waveformSlice } from '../mixWaveform';
it('draws only peaks belonging to the selected source range', () => {
  expect(waveformSlice([0.1, 0.2, 0.8, 0.9], 0, 2000, 4000, 2)).toEqual([0.1, 0.2]);
  expect(waveformSlice([0.1, 0.2, 0.8, 0.9], 2000, 4000, 4000, 2)).toEqual([0.8, 0.9]);
  expect(waveformSlice([], 0, 1000, 4000, 2)).toEqual([]);
});
