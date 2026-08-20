export interface NoteTailTuning {
  colorReferenceInset: number;
  mainStartFine: number;
  mainEndFine: number;
  smallStartFine: number;
  smallEndFine: number;
  orbitAngle: number;
  mainDistance: number;
  smallAngleOffset: number;
  smallDistance: number;
}

export type NoteTailTuningById = Record<string, Partial<NoteTailTuning>>;

export const DEFAULT_NOTE_TAIL_TUNING: NoteTailTuning = {
  colorReferenceInset: 0,
  mainStartFine: -0.078,
  mainEndFine: -0.2,
  smallStartFine: -0.2,
  smallEndFine: -0.2,
  orbitAngle: 142,
  mainDistance: 0.5,
  smallAngleOffset: -12,
  smallDistance: 11,
};

export const resolveNoteTailTuning = (
  ...overrides: Array<Partial<NoteTailTuning> | undefined>
): NoteTailTuning => ({
  ...DEFAULT_NOTE_TAIL_TUNING,
  ...overrides[0],
  ...overrides[1],
  ...overrides[2],
});
