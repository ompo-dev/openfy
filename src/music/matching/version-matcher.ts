import type {
  TrackVersion,
  TrackVersionType,
} from '../identity/canonical-track';

const patterns: Array<{
  type: TrackVersionType;
  regex: RegExp;
}> = [
  {
    type: 'LIVE',
    regex: /\b(live|concert)\b/i,
  },
  {
    type: 'REMIX',
    regex: /\b(remix|rework)\b/i,
  },
  {
    type: 'ACOUSTIC',
    regex: /\b(acoustic|unplugged)\b/i,
  },
  {
    type: 'REMASTER',
    regex: /\b(remaster(ed)?)\b/i,
  },
  {
    type: 'RADIO_EDIT',
    regex: /\bradio\s*(edit|version)\b/i,
  },
  {
    type: 'EXTENDED',
    regex: /\bextended\b/i,
  },
  {
    type: 'INSTRUMENTAL',
    regex: /\binstrumental\b/i,
  },
  {
    type: 'CLEAN',
    regex: /\bclean\b/i,
  },
  {
    type: 'EXPLICIT',
    regex: /\bexplicit\b/i,
  },
];

export function detectVersion(
  title: string
): TrackVersion {
  for (const pattern of patterns) {
    if (pattern.regex.test(title)) {
      return {
        type: pattern.type,
        label: title,
      };
    }
  }

  return {
    type: 'ORIGINAL',
  };
}

export function compareVersions(
  a: TrackVersion,
  b: TrackVersion
): number {
  if (
    a.type === b.type
  ) {
    return 1;
  }

  if (
    a.type === 'UNKNOWN' ||
    b.type === 'UNKNOWN'
  ) {
    return 0.5;
  }

  return 0;
}
