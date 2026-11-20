export function rotateHomeCandidates<T>(items: readonly T[], variation: number): T[] {
  if (!items.length) return [];
  const offset = Math.abs(Math.trunc(variation)) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Keep newly returned candidates ahead of items already shown, without discarding an offline fallback. */
export function preferUnseenHomeTracks<T extends { spotifyId: string }>(items: T[], previousIds: ReadonlySet<string>): T[] {
  return [...items.filter((item) => !previousIds.has(item.spotifyId)), ...items.filter((item) => previousIds.has(item.spotifyId))];
}

export function spreadHomeReleases<T extends { artistId: string }>(items: T[], variation = 0): T[] {
  const groups = new Map<string, T[]>();
  items.forEach((item) => groups.set(item.artistId, [...(groups.get(item.artistId) || []), item]));
  const queues = [...groups.values()].map(([latest, ...older]) => [latest, ...rotateHomeCandidates(older, variation)]);
  const result: T[] = [];
  for (let index = 0; queues.some((queue) => index < queue.length); index++) {
    queues.forEach((queue) => { if (queue[index]) result.push(queue[index]); });
  }
  return result;
}

/** Balance visual formats as well as families; keep a homogeneous tail in one rail. */
export function interleaveHomeSections<T>(groups: { kind: string; layout?: string; items: T[] }[], merge: (kind: string, items: T[]) => T): T[] {
  const pending = groups.map((group) => ({ ...group, layout: group.layout || group.kind, items: [...group.items], lastUsed: -1 }));
  const result: T[] = [];
  let previous: typeof pending[number] | undefined;
  while (pending.some((group) => group.items.length)) {
    const remaining = pending.filter((group) => group.items.length);
    if (previous && remaining.every((group) => group.layout === previous?.layout)) {
      const kinds = new Set([previous.kind, ...remaining.map((group) => group.kind)]);
      const last = result.pop()!;
      result.push(merge(kinds.size === 1 ? previous.kind : 'mixed', [last, ...remaining.flatMap((group) => group.items)]));
      break;
    }
    const differentLayout = remaining.filter((group) => group.layout !== previous?.layout);
    const available = differentLayout.length ? differentLayout : remaining;
    const next = available.sort((a, b) => a.lastUsed - b.lastUsed)[0];
    result.push(next.items.shift()!);
    next.lastUsed = result.length;
    previous = next;
  }
  return result;
}
