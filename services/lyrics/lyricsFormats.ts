import { XMLParser } from 'fast-xml-parser';
import { parseLrcToSegments, type LyricSegment } from './lyricsService';

export const lyricTimeMs = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  if (/^\d+(?:\.\d+)?ms$/.test(value)) return Number.parseFloat(value);
  if (/^\d+(?:\.\d+)?s$/.test(value)) return Number.parseFloat(value) * 1000;
  if (!/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(value)) return null;
  return value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0) * 1000;
};

const xml = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false,
  parseTagValue: false, processEntities: true, removeNSPrefix: true });
type XmlNode = Record<string, any>;
const textOf = (nodes: XmlNode[]): string => nodes.map((node) => {
  if ('#text' in node) return String(node['#text']);
  return Object.entries(node).filter(([key]) => key !== ':@').map(([key, value]) =>
    key === 'br' ? '\n' : Array.isArray(value) ? textOf(value) : '').join('');
}).join('');

export const parseTtml = (document: string, durationMs = 0): LyricSegment[] => {
  if (document.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(document)) return [];
  const segments: LyricSegment[] = [];
  const walk = (nodes: XmlNode[], inheritedStart = 0) => {
    for (const node of nodes) {
      const attributes = node[':@'] || {};
      const start = lyricTimeMs(attributes['@_begin']) ?? inheritedStart;
      for (const [tag, children] of Object.entries(node)) {
        if (tag === ':@' || !Array.isArray(children)) continue;
        if (tag === 'p') {
          const text = textOf(children).trim();
          const words: NonNullable<LyricSegment['words']> = [];
          const collect = (spans: XmlNode[]) => spans.forEach((span) => {
            const attrs = span[':@'] || {};
            for (const [kind, content] of Object.entries(span)) {
              if (kind === ':@' || !Array.isArray(content)) continue;
              const from = lyricTimeMs(attrs['@_begin']);
              const to = lyricTimeMs(attrs['@_end']);
              const word = textOf(content);
              if (kind === 'span' && from !== null && to !== null && to > from && word.trim())
                words.push({ text: word, startTimeMs: from, endTimeMs: to });
              else collect(content);
            }
          });
          collect(children);
          const end = lyricTimeMs(attributes['@_end']) ??
            (lyricTimeMs(attributes['@_dur']) !== null ? start + lyricTimeMs(attributes['@_dur'])! : words.at(-1)?.endTimeMs ?? 0);
          // Untimed TTML is plain text, never invented synchronization.
          if (text && (attributes['@_begin'] !== undefined || words.length))
            segments.push({ index: segments.length, text, startTimeMs: words[0]?.startTimeMs ?? start,
              endTimeMs: end, ...(words.length ? { words } : {}) });
        } else walk(children, start);
      }
    }
  };
  try { walk(xml.parse(document)); } catch { return []; }
  return finalizeSegments(segments, durationMs);
};

export const finalizeSegments = (segments: LyricSegment[], durationMs: number): LyricSegment[] =>
  segments.filter((line) => line.text.trim() && Number.isFinite(line.startTimeMs) && line.startTimeMs >= 0)
    .sort((a, b) => a.startTimeMs - b.startTimeMs).map((line, index, lines) => ({ ...line, index,
      endTimeMs: line.endTimeMs > line.startTimeMs ? line.endTimeMs :
        lines[index + 1]?.startTimeMs ?? Math.max(durationMs, line.startTimeMs + 5000) }));

export const parseLyricsPayload = (payload: unknown, durationMs = 0, depth = 0): { plainLyrics: string; segments: LyricSegment[] } | null => {
  if (depth > 12) return null;
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text || text.length > 2_000_000) return null;
    if (text.startsWith('{') || text.startsWith('[')) {
      try { return parseLyricsPayload(JSON.parse(text), durationMs, depth + 1); }
      catch { if (text.startsWith('{') || /^\[\s*(?:\{|")/.test(text)) return null; }
    }
    const segments = /<(?:\w+:)?tt\b/.test(text) ? parseTtml(text, durationMs) : parseLrcToSegments(text, durationMs);
    // HTML error pages from a provider must never appear as lyrics.
    if (!segments.length && text.startsWith('<')) {
      if (!/<(?:\w+:)?tt\b/.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) return null;
      try {
        const paragraphs: string[] = [];
        const collect = (nodes: XmlNode[]) => nodes.forEach((node) => {
          for (const [tag, children] of Object.entries(node)) {
            if (!Array.isArray(children)) continue;
            if (tag === 'p') paragraphs.push(textOf(children).trim());
            else collect(children);
          }
        });
        collect(xml.parse(text));
        const plainLyrics = paragraphs.filter(Boolean).join('\n');
        return plainLyrics ? { segments: [], plainLyrics } : null;
      } catch { return null; }
    }
    if (/^(?:lyrics? (?:not found|unavailable)|error)\b/i.test(text)) return null;
    const plainLyrics = segments.length ? segments.map((line) => line.text).join('\n') :
      text.replace(/^\[(?:ar|al|ti|by|offset|length|re|ve):[^\]]*\]\s*$/gim, '').trim();
    return plainLyrics ? { segments, plainLyrics } : null;
  }
  if (Array.isArray(payload)) {
    if (payload.every((line) => typeof line === 'string')) return parseLyricsPayload(payload.join('\n'), durationMs, depth + 1);
    return parseLyricsPayload({ lyrics: payload }, durationMs, depth + 1);
  }
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (data.isError === true || data.ok === false || data.error || data.success === false) return null;
  if (Array.isArray(data.lyrics)) {
    const segments = data.lyrics.flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, any>;
      if (typeof row.time !== 'number') return [];
      const words = Array.isArray(row.syllabus) ? row.syllabus.flatMap((part: any) =>
        typeof part.time === 'number' && typeof part.text === 'string' ? [{ text: part.text,
          startTimeMs: part.time, endTimeMs: part.time + Math.max(1, Number(part.duration) || 0) }] : []) : [];
      const text = typeof row.text === 'string' && row.text.trim() ? row.text :
        words.length ? words.map((word: any) => word.text).join('').trim() : undefined;
      return typeof text === 'string' && text.trim() ? [{ index, text, startTimeMs: row.time,
        endTimeMs: row.time + (Number(row.duration) || 0), ...(words.length ? { words } : {}) }] : [];
    });
    if (segments.length) return { segments: finalizeSegments(segments, durationMs),
      plainLyrics: segments.map((line) => line.text).join('\n') };
  }
  for (const key of ['ttml', 'ttmlContent', 'syncedLyrics', 'lrc', 'lyrics', 'lyric', 'content', 'text', 'data', 'result', 'response', 'plainLyrics']) {
    if (data[key] === payload) continue;
    const found = parseLyricsPayload(data[key], durationMs, depth + 1);
    if (found) return found;
  }
  return null;
};
