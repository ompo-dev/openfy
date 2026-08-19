import type {
  LyricLine,
} from './types';

export class LyricsSynchronizer {
  private index = 0;

  constructor(
    private readonly lines: LyricLine[]
  ) {}

  update(
    positionMs: number
  ): number {
    while (
      this.index < this.lines.length - 1 &&
      this.lines[this.index + 1].startMs <= positionMs
    ) {
      this.index++;
    }

    while (
      this.index > 0 &&
      this.lines[this.index].startMs > positionMs
    ) {
      this.index--;
    }

    return this.index;
  }

  getCurrentLine(
    positionMs: number
  ): LyricLine | undefined {
    const index = this.update(positionMs);
    const line = this.lines[index];

    if (!line) {
      return undefined;
    }

    if (line.endMs != null && positionMs > line.endMs) {
      return undefined;
    }

    return line;
  }

  reset() {
    this.index = 0;
  }
}
