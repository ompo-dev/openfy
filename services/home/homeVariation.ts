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

/** Separate section families; combine a remaining tail instead of repeating identical headings. */
export function interleaveHomeSections<T>(groups: { kind: string; items: T[] }[], merge: (kind: string, items: T[]) => T): T[] {
  const pending = groups.map((group) => ({ ...group, items: [...group.items] }));
  const result: T[] = [];
  let previous = '';
  while (pending.some((group) => group.items.length)) {
    const available = pending.filter((group) => group.items.length && group.kind !== previous);
    if (!available.length) {
      const tail = pending.find((group) => group.items.length)!;
      const last = result.pop()!;
      result.push(merge(tail.kind, [last, ...tail.items]));
      break;
    }
    const next = result.length === 0 ? available[0] : available.sort((a, b) => b.items.length - a.items.length)[0];
    result.push(next.items.shift()!);
    previous = next.kind;
  }
  return result;
}
