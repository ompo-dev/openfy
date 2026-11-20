import type { LyricSyllable, LyricWord } from './lyricsService';

export type LyricPiece = { text: string; startTimeMs?: number; endTimeMs?: number };

/** Whitespace defines word boundaries; provider spans often name only a syllable. */
export const groupLyricPieces = (pieces: LyricPiece[]): LyricWord[] => {
  const words: LyricWord[] = [];
  let text = '';
  let syllables: LyricSyllable[] = [];
  const flush = () => {
    if (text && syllables.length) words.push({ text,
      startTimeMs: Math.min(...syllables.map((part) => part.startTimeMs)),
      endTimeMs: Math.max(...syllables.map((part) => part.endTimeMs)),
      ...(syllables.length > 1 ? { syllables } : {}) });
    text = ''; syllables = [];
  };
  for (const piece of pieces) {
    const timed = Number.isFinite(piece.startTimeMs) && Number.isFinite(piece.endTimeMs) &&
      piece.startTimeMs! >= 0 && piece.endTimeMs! > piece.startTimeMs!;
    // A whole phrase with one timing remains one fragment, not invented word timing.
    if (timed && /\S\s+\S/.test(piece.text)) {
      flush();
      words.push({ text: piece.text.trim(), startTimeMs: piece.startTimeMs!, endTimeMs: piece.endTimeMs! });
      continue;
    }
    for (const part of piece.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { flush(); continue; }
      text += part;
      if (timed) syllables.push({ text: part, startTimeMs: piece.startTimeMs!, endTimeMs: piece.endTimeMs! });
    }
  }
  flush();
  return words;
};

const fraction = (position: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (position - start) / Math.max(1, end - start)));

export const lyricWordProgress = (word: LyricWord, positionMs: number) => {
  if (!Number.isFinite(positionMs) || positionMs <= word.startTimeMs) return 0;
  if (positionMs >= word.endTimeMs) return 1;
  if (!word.syllables?.length) return fraction(positionMs, word.startTimeMs, word.endTimeMs);
  const total = word.syllables.reduce((size, part) => size + Array.from(part.text).length, 0);
  return total ? word.syllables.reduce((sung, part) => sung + Array.from(part.text).length *
    fraction(positionMs, part.startTimeMs, part.endTimeMs), 0) / total : 0;
};
