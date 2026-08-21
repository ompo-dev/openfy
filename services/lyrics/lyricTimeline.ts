import type { LyricSegment } from './lyricsService';

export type LyricTimelineBlock =
  | ({ kind: 'lyric' } & LyricSegment)
  | {
      kind: 'gap';
      id: string;
      startTimeMs: number;
      endTimeMs: number;
      text: '♪ ♪ ♪';
    };

export type LyricGapTarget = {
  previousIndex: number | null;
  nextIndex: number | null;
};

const MIN_SEGMENT_DURATION_MS = 150;
const GAP_BLOCK_MIN_DURATION_MS = 1000;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(value, maximum));

export const normalizeLyricSegments = (segments: LyricSegment[]) =>
  [...segments]
    .sort((left, right) => left.startTimeMs - right.startTimeMs)
    .map((segment, index) => ({ ...segment, index }));

export const getLyricTimelineBlocks = (
  segments: LyricSegment[],
  durationMs: number
): LyricTimelineBlock[] => {
  const normalized = normalizeLyricSegments(segments);
  const blocks: LyricTimelineBlock[] = [];
  let previousEndMs = 0;

  normalized.forEach((segment) => {
    if (segment.startTimeMs - previousEndMs >= GAP_BLOCK_MIN_DURATION_MS) {
      blocks.push({
        kind: 'gap',
        id: `gap_${previousEndMs}_${segment.startTimeMs}`,
        startTimeMs: previousEndMs,
        endTimeMs: segment.startTimeMs,
        text: '♪ ♪ ♪',
      });
    }
    blocks.push({ kind: 'lyric', ...segment });
    previousEndMs = Math.max(previousEndMs, segment.endTimeMs);
  });

  if (durationMs - previousEndMs >= GAP_BLOCK_MIN_DURATION_MS) {
    blocks.push({
      kind: 'gap',
      id: `gap_${previousEndMs}_${durationMs}`,
      startTimeMs: previousEndMs,
      endTimeMs: durationMs,
      text: '♪ ♪ ♪',
    });
  }

  return blocks;
};

export const moveLyricSegment = (
  segments: LyricSegment[],
  index: number,
  requestedDeltaMs: number,
  durationMs?: number
) => {
  const normalized = normalizeLyricSegments(segments);
  const selected = normalized[index];
  if (!selected) return normalized;

  const previousEndMs = index > 0 ? normalized[index - 1].endTimeMs : 0;
  const lastEndMs =
    normalized[normalized.length - 1]?.endTimeMs ?? selected.endTimeMs;
  const deltaMs = clamp(
    requestedDeltaMs,
    previousEndMs - selected.startTimeMs,
    durationMs === undefined ? Number.POSITIVE_INFINITY : durationMs - lastEndMs
  );

  return normalized.map((segment, segmentIndex) =>
    segmentIndex < index
      ? segment
      : {
          ...segment,
          startTimeMs: segment.startTimeMs + deltaMs,
          endTimeMs: segment.endTimeMs + deltaMs,
        }
  );
};

export const resizeLyricSegmentStart = (
  segments: LyricSegment[],
  index: number,
  requestedDeltaMs: number
) => {
  const normalized = normalizeLyricSegments(segments);
  const selected = normalized[index];
  if (!selected) return normalized;

  const firstStartMs = normalized[0]?.startTimeMs ?? selected.startTimeMs;
  const deltaMs = clamp(
    requestedDeltaMs,
    -firstStartMs,
    selected.endTimeMs - MIN_SEGMENT_DURATION_MS - selected.startTimeMs
  );

  return normalized.map((segment, segmentIndex) => {
    if (segmentIndex < index) {
      return {
        ...segment,
        startTimeMs: segment.startTimeMs + deltaMs,
        endTimeMs: segment.endTimeMs + deltaMs,
      };
    }
    return segmentIndex === index
      ? { ...segment, startTimeMs: segment.startTimeMs + deltaMs }
      : segment;
  });
};

export const resizeLyricSegmentEnd = (
  segments: LyricSegment[],
  index: number,
  requestedDeltaMs: number,
  durationMs?: number
) => {
  const normalized = normalizeLyricSegments(segments);
  const selected = normalized[index];
  if (!selected) return normalized;

  const lastEndMs =
    normalized[normalized.length - 1]?.endTimeMs ?? selected.endTimeMs;
  const deltaMs = clamp(
    requestedDeltaMs,
    selected.startTimeMs + MIN_SEGMENT_DURATION_MS - selected.endTimeMs,
    durationMs === undefined ? Number.POSITIVE_INFINITY : durationMs - lastEndMs
  );

  return normalized.map((segment, segmentIndex) => {
    if (segmentIndex < index) return segment;
    if (segmentIndex === index) {
      return { ...segment, endTimeMs: segment.endTimeMs + deltaMs };
    }
    return {
      ...segment,
      startTimeMs: segment.startTimeMs + deltaMs,
      endTimeMs: segment.endTimeMs + deltaMs,
    };
  });
};

export const getLyricGapRange = (
  segments: LyricSegment[],
  target: LyricGapTarget,
  durationMs: number
) => {
  const normalized = normalizeLyricSegments(segments);
  return {
    startTimeMs:
      target.previousIndex === null
        ? 0
        : (normalized[target.previousIndex]?.endTimeMs ?? 0),
    endTimeMs:
      target.nextIndex === null
        ? durationMs
        : (normalized[target.nextIndex]?.startTimeMs ?? durationMs),
  };
};

export const moveLyricGap = (
  segments: LyricSegment[],
  target: LyricGapTarget,
  requestedDeltaMs: number,
  durationMs?: number
) => {
  const normalized = normalizeLyricSegments(segments);
  const previous =
    target.previousIndex === null
      ? undefined
      : normalized[target.previousIndex];
  const next =
    target.nextIndex === null ? undefined : normalized[target.nextIndex];

  if (!previous && !next) return normalized;
  if (!previous && target.nextIndex !== null) {
    return moveLyricSegment(
      normalized,
      target.nextIndex,
      requestedDeltaMs,
      durationMs
    );
  }
  if (!next && target.previousIndex !== null) {
    return resizeLyricSegmentEnd(
      normalized,
      target.previousIndex,
      requestedDeltaMs,
      durationMs
    );
  }
  if (
    !previous ||
    !next ||
    target.previousIndex === null ||
    target.nextIndex === null
  ) {
    return normalized;
  }

  const deltaMs = clamp(
    requestedDeltaMs,
    previous.startTimeMs + MIN_SEGMENT_DURATION_MS - previous.endTimeMs,
    next.endTimeMs - MIN_SEGMENT_DURATION_MS - next.startTimeMs
  );
  return normalized.map((segment, index) => {
    if (index === target.previousIndex) {
      return { ...segment, endTimeMs: segment.endTimeMs + deltaMs };
    }
    if (index === target.nextIndex) {
      return { ...segment, startTimeMs: segment.startTimeMs + deltaMs };
    }
    return segment;
  });
};

export const resizeLyricGapStart = (
  segments: LyricSegment[],
  target: LyricGapTarget,
  requestedDeltaMs: number,
  durationMs: number
) => {
  const previousIndex = target.previousIndex;
  if (previousIndex === null) return normalizeLyricSegments(segments);
  const normalized = normalizeLyricSegments(segments);
  const previous = normalized[previousIndex];
  if (!previous) return normalized;
  const firstStartMs = normalized[0]?.startTimeMs ?? previous.startTimeMs;
  const nextStartMs =
    target.nextIndex === null
      ? durationMs
      : (normalized[target.nextIndex]?.startTimeMs ?? durationMs);
  const deltaMs = clamp(
    requestedDeltaMs,
    -firstStartMs,
    nextStartMs - previous.endTimeMs
  );
  return normalized.map((segment, index) =>
    index <= previousIndex
      ? {
          ...segment,
          startTimeMs: segment.startTimeMs + deltaMs,
          endTimeMs: segment.endTimeMs + deltaMs,
        }
      : segment
  );
};

export const resizeLyricGapEnd = (
  segments: LyricSegment[],
  target: LyricGapTarget,
  requestedDeltaMs: number,
  durationMs?: number
) => {
  if (target.nextIndex === null) return normalizeLyricSegments(segments);
  const normalized = normalizeLyricSegments(segments);
  return moveLyricSegment(
    normalized,
    target.nextIndex,
    requestedDeltaMs,
    durationMs
  );
};
