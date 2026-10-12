import { XMLParser } from 'fast-xml-parser';
import { parseLrcToSegments, type LyricSegment } from './lyricsService';
import { groupLyricPieces, type LyricPiece } from './lyricsTiming';

export const lyricTimeMs = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  if (/^\d+(?:\.\d+)?ms$/.test(text)) return Number.parseFloat(text);
  if (/^\d+(?:\.\d+)?s$/.test(text)) return Number.parseFloat(text) * 1000;
  if (!/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(text)) return null;
  return Math.round(text.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0) * 1000);
};

const xml = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false,
  parseTagValue: false, processEntities: true, removeNSPrefix: true });
type XmlNode = Record<string, any>;
const textOf = (nodes: XmlNode[]): string => nodes.map((node) => {
  if (['x-translation', 'x-roman'].includes(node[':@']?.['@_role'])) return '';
  if ('#text' in node) return String(node['#text']);
  return Object.entries(node).filter(([key]) => key !== ':@').map(([key, value]) =>
    key === 'br' ? '\n' : Array.isArray(value) ? textOf(value) : '').join('');
}).join('');

const timedDescendant = (nodes: XmlNode[]): boolean => nodes.some((node) =>
  node[':@']?.['@_begin'] !== undefined || Object.entries(node).some(([key, children]) =>
    key !== ':@' && Array.isArray(children) && timedDescendant(children)));

const collectTtmlPieces = (nodes: XmlNode[], lead: LyricPiece[], backing: LyricPiece[], isBacking = false) => {
  for (const node of nodes) {
    if ('#text' in node) { (isBacking ? backing : lead).push({ text: String(node['#text']) }); continue; }
    const attributes = node[':@'] || {};
    if (['x-translation', 'x-roman'].includes(attributes['@_role'])) continue;
    const background = isBacking || attributes['@_role'] === 'x-bg';
    const sink = background ? backing : lead;
    for (const [tag, children] of Object.entries(node)) {
      if (tag === ':@' || !Array.isArray(children)) continue;
      if (tag === 'br') { sink.push({ text: '\n' }); continue; }
      const start = lyricTimeMs(attributes['@_begin']);
      const duration = lyricTimeMs(attributes['@_dur']);
      const end = lyricTimeMs(attributes['@_end']) ?? (start !== null && duration !== null ? start + duration : null);
      if (tag === 'span' && start !== null && end !== null && end > start && !timedDescendant(children)) {
        sink.push({ text: textOf(children), startTimeMs: start, endTimeMs: end });
      } else collectTtmlPieces(children, lead, backing, background);
    }
  }
};

export const parseTtml = (document: string, durationMs = 0): LyricSegment[] => {
  if (document.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(document)) return [];
  const segments: LyricSegment[] = [];
  const walk = (nodes: XmlNode[], inheritedStart?: number) => {
    for (const node of nodes) {
      const attributes = node[':@'] || {};
      if (['x-translation', 'x-roman'].includes(attributes['@_role'])) continue;
      const explicitStart = lyricTimeMs(attributes['@_begin']);
      const start = explicitStart ?? inheritedStart ?? 0;
      for (const [tag, children] of Object.entries(node)) {
        if (tag === ':@' || !Array.isArray(children)) continue;
        if (tag === 'p') {
          const lead: LyricPiece[] = [], backing: LyricPiece[] = [];
          collectTtmlPieces(children, lead, backing);
          const text = lead.map((piece) => piece.text).join('').replace(/\s+/g, ' ').trim();
          const words = groupLyricPieces(lead), backgroundWords = groupLyricPieces(backing);
          const end = lyricTimeMs(attributes['@_end']) ??
            (lyricTimeMs(attributes['@_dur']) !== null ? start + lyricTimeMs(attributes['@_dur'])! : words.at(-1)?.endTimeMs ?? 0);
          // Untimed TTML is plain text, never invented synchronization.
          if (text && (explicitStart !== null || inheritedStart !== undefined || words.length))
            segments.push({ index: segments.length, text,
              startTimeMs: words.length ? explicitStart !== null || inheritedStart !== undefined
                ? Math.min(start, words[0].startTimeMs) : words[0].startTimeMs : start,
              endTimeMs: end, ...(words.length ? { words } : {}),
              ...(backgroundWords.length ? { background: {
                text: backing.map((piece) => piece.text).join('').replace(/\s+/g, ' ').trim(),
                startTimeMs: backgroundWords[0].startTimeMs,
                endTimeMs: Math.max(...backgroundWords.map((word) => word.endTimeMs)), words: backgroundWords,
              } } : {}) });
        } else walk(children, explicitStart ?? inheritedStart);
      }
    }
  };
  try { walk(xml.parse(document)); } catch { return []; }
  return finalizeSegments(segments, durationMs);
};

export const parseKaraokeLyrics = (text: string, durationMs = 0): LyricSegment[] => {
  const lines: LyricSegment[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim().match(/^\[(\d+),(\d+)\](.*)$/);
    if (!row) continue;
    const body = row[3];
    const prefix = /^\s*\(/.test(body);
    const pattern = prefix ? /\((\d+),(\d+)(?:,\d+)?\)([^()]*)/g : /([^()]*)\((\d+),(\d+)(?:,\d+)?\)/g;
    const pieces = [...body.matchAll(pattern)].map((part) => {
      const start = Number(part[prefix ? 1 : 2]), duration = Number(part[prefix ? 2 : 3]);
      return { text: part[prefix ? 3 : 1], startTimeMs: start, endTimeMs: start + duration };
    });
    const words = groupLyricPieces(pieces);
    if (!words.length) continue;
    lines.push({ index: lines.length, startTimeMs: Number(row[1]), endTimeMs: Number(row[1]) + Number(row[2]),
      text: body.replace(/\(\d+,\d+(?:,\d+)?\)/g, '').trim(), words });
  }
  return finalizeSegments(lines, durationMs);
};

export const finalizeSegments = (segments: LyricSegment[], durationMs: number): LyricSegment[] =>
  segments.filter((line) => line.text.trim() && Number.isFinite(line.startTimeMs) && line.startTimeMs >= 0)
    .sort((a, b) => a.startTimeMs - b.startTimeMs).map((line, index, lines) => ({ ...line, index,
      endTimeMs: line.endTimeMs > line.startTimeMs ? line.endTimeMs :
        lines[index + 1]?.startTimeMs ?? Math.max(durationMs, line.startTimeMs + 5000) }));

export const parseLyricsPayload = (payload: unknown, durationMs = 0, depth = 0): { plainLyrics: string; segments: LyricSegment[] } | null => {
  if (depth > 12) return null;
  if (typeof payload === 'string') {
    let text = payload.replace(/^\uFEFF/, '').trim();
    if (text.startsWith('```')) text = text.replace(/^```[^\r\n]*\r?\n/, '').replace(/\r?\n```\s*$/, '').trim();
    if (!text || text.length > 2_000_000) return null;
    if (text.startsWith('{') || text.startsWith('[') || text.startsWith('"')) {
      try { return parseLyricsPayload(JSON.parse(text), durationMs, depth + 1); }
      catch { if (text.startsWith('{') || text.startsWith('"') || /^\[\s*(?:\{|")/.test(text)) return null; }
    }
    if (/&lt;(?:\w+:)?tt\b/i.test(text)) {
      try { text = textOf(xml.parse(`<value>${text}</value>`)); } catch { return null; }
    }
    if (/LyricContent\s*=/i.test(text)) {
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;
      let content: string | undefined;
      const find = (nodes: XmlNode[]) => nodes.forEach((node) => {
        if (typeof node[':@']?.['@_LyricContent'] === 'string') content ||= node[':@']['@_LyricContent'];
        Object.values(node).forEach((children) => { if (Array.isArray(children)) find(children); });
      });
      try { find(xml.parse(text)); } catch { return null; }
      if (content) text = content;
    }
    const karaoke = parseKaraokeLyrics(text, durationMs);
    const segments = /<(?:\w+:)?tt\b/i.test(text) ? parseTtml(text, durationMs) :
      karaoke.length ? karaoke : parseLrcToSegments(text, durationMs);
    // HTML error pages from a provider must never appear as lyrics.
    if (!segments.length && text.startsWith('<')) {
      if (!/<(?:\w+:)?tt\b/i.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) return null;
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
      const parts: LyricPiece[] = Array.isArray(row.syllabus) ? row.syllabus.flatMap((part: any, i: number, parts: any[]) => {
        if (typeof part.time !== 'number' || typeof part.text !== 'string') return [];
        const end = Number(part.duration) > 0 ? part.time + Number(part.duration) :
          parts[i + 1]?.time ?? (Number(row.duration) > 0 ? row.time + Number(row.duration) : part.time);
        return [{ text: part.text, startTimeMs: part.time, endTimeMs: end }];
      }) : [];
      const words = groupLyricPieces(parts);
      const text = typeof row.text === 'string' && row.text.trim() ? row.text :
        parts.length ? parts.map((part) => part.text).join('').trim() : undefined;
      return typeof text === 'string' && text.trim() ? [{ index, text, startTimeMs: row.time,
        endTimeMs: row.time + (Number(row.duration) || 0), ...(words.length ? { words } : {}) }] : [];
    });
    if (segments.length) return { segments: finalizeSegments(segments, durationMs),
      plainLyrics: segments.map((line) => line.text).join('\n') };
  }
  for (const key of ['ttml', 'ttmlContent', 'syncedLyrics', 'lrc', 'lyrics', 'lyric', 'content', 'text', 'line', 'lines', 'data', 'result', 'response', 'plainLyrics']) {
    if (data[key] === payload) continue;
    const found = parseLyricsPayload(data[key], durationMs, depth + 1);
    if (found) return found;
  }
  return null;
};
