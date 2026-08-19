/**
 * IdentityLock - Immutable Canonical Track Container
 *
 * Guarantees that the initial anchor of truth (e.g. Spotify Track / Apple Music Track)
 * is permanently locked. Secondary discovery sources (Letras, YouTube, SoundCloud, MusicBrainz)
 * are NEVER permitted to overwrite title, artists, album, duration, or artwork.
 */

import type { CanonicalTrack, Artist, Album, TrackArtwork } from './canonical-track';

export class IdentityLock {
  public readonly id: string;
  public readonly title: string;
  public readonly artists: ReadonlyArray<Artist>;
  public readonly album?: Readonly<Album>;
  public readonly durationMs?: number;
  public readonly isrc?: string;
  public readonly artwork?: Readonly<TrackArtwork>;
  public readonly anchorProvider: string;

  constructor(track: {
    id: string;
    title: string;
    artists: Artist[];
    album?: Album;
    durationMs?: number;
    isrc?: string;
    artwork?: TrackArtwork;
    anchorProvider?: string;
  }) {
    this.id = track.id;
    this.title = track.title.trim();
    this.artists = Object.freeze([...(track.artists || [{ name: 'Artista' }])]);
    this.album = track.album ? Object.freeze({ ...track.album }) : undefined;
    this.durationMs = track.durationMs;
    this.isrc = track.isrc;
    this.artwork = track.artwork ? Object.freeze({ ...track.artwork }) : undefined;
    this.anchorProvider = track.anchorProvider || 'spotify';
    Object.freeze(this);
  }

  /**
   * Primary canonical artist name
   */
  public get primaryArtist(): string {
    return this.artists[0]?.name || '';
  }

  /**
   * All canonical artist names
   */
  public get artistNames(): string[] {
    return this.artists.map(a => a.name);
  }

  /**
   * Generate prioritized composite search queries for multi-artist / cypher tracks
   */
  public getCompositeQueries(): string[] {
    const queries: string[] = [];
    const t = this.title;
    const pArtist = this.primaryArtist;

    // 1. Primary Artist + Title
    if (pArtist) {
      queries.push(`"${t}" "${pArtist}"`);
      queries.push(`${pArtist} - ${t}`);
    }

    // 2. Secondary / Featured Artists + Title (essential for collective tracks like Poetas no Topo)
    for (let i = 1; i < Math.min(this.artists.length, 4); i++) {
      const art = this.artists[i].name;
      queries.push(`"${t}" "${art}"`);
    }

    // 3. Album + Title if album differs from title
    if (this.album?.name && this.album.name.toLowerCase() !== t.toLowerCase()) {
      queries.push(`"${t}" "${this.album.name}"`);
    }

    // 4. Exact Title
    queries.push(`"${t}"`);
    queries.push(t);

    return [...new Set(queries)];
  }

  /**
   * Export as standard CanonicalTrack object without allowing external mutations
   */
  public toCanonicalTrack(): CanonicalTrack {
    return {
      id: this.id,
      title: this.title,
      artists: [...this.artists],
      album: this.album ? { ...this.album } : undefined,
      durationMs: this.durationMs,
      isrc: this.isrc,
      version: { type: 'ORIGINAL' },
      artwork: this.artwork ? { ...this.artwork } : undefined,
      sources: [{ provider: this.anchorProvider as any, id: this.id }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
