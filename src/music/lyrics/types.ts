export interface LyricWord {
  word: string;
  startMs: number;
  endMs?: number;
}

export interface LyricLine {
  text: string;
  startMs: number;
  endMs?: number;
  words?: LyricWord[];
}

export interface Lyrics {
  trackId: string;
  language?: string;
  synced: boolean;
  lines: LyricLine[];
  source: string;
}
