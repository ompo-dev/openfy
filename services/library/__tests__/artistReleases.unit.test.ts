import { mergeArtistReleases } from '../artistReleases';
import type { LibraryItemModel } from '@models';

const release = (id: string, title = 'KM2'): LibraryItemModel => ({ id, title, subtitle: 'Ebony', imageURL: '', releaseType: 'album' });

describe('artist releases', () => {
  it('replaces the local saved subset with the complete release regardless of insertion order', () => {
    const local = release('local_album_spotify:old');
    const complete = release('ytalbum_MPREkm2');
    expect(mergeArtistReleases([local], [complete])).toEqual([complete]);
    expect(mergeArtistReleases([complete], [local])).toEqual([complete]);
  });

  it('does not conflate different public versions or releases', () => {
    const versions = [release('ytalbum_a'), release('ytalbum_b'), release('ytalbum_c', 'KM2 Deluxe')];
    expect(mergeArtistReleases(versions, versions)).toEqual(versions);
  });
});
