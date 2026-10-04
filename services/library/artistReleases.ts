import type { LibraryItemModel } from '@models';

export const normalizeReleaseTitle = (title: string) => title
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** A local subset is not a separate release from the complete public album. */
export const mergeArtistReleases = (current: LibraryItemModel[], incoming: LibraryItemModel[]) => {
  const releases: LibraryItemModel[] = [];
  for (const release of [...current, ...incoming]) {
    const index = releases.findIndex((candidate) => candidate.id === release.id || (
      (candidate.id.startsWith('local_album_') || release.id.startsWith('local_album_')) &&
      normalizeReleaseTitle(candidate.title) === normalizeReleaseTitle(release.title)
    ));
    if (index < 0) releases.push(release);
    else if (releases[index].id.startsWith('local_album_') && !release.id.startsWith('local_album_')) releases[index] = release;
  }
  return releases;
};
