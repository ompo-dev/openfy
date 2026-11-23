import { getCatalogMapping, setCatalogMappingsBatch } from '../../audio/catalogMappingCache';
import { upsertCatalogTracks } from '../catalogLibrary';
import { upsertLocalPlaylist } from '../localPlaylistManager';
import { clearTrackUnavailableMany } from '../../../stores/useTrackAvailabilityStore';
import {
  exportPlaylistJson, importPlaylistJson, parsePlaylistJson,
} from '../playlistJsonTransfer';

const mockRefreshLibrary = jest.fn();
jest.mock('../catalogLibrary', () => ({
  upsertCatalogTracks: jest.fn().mockResolvedValue([]),
}));
jest.mock('../localPlaylistManager', () => ({
  upsertLocalPlaylist: jest.fn(async (input) => ({
    id: 'local_local_' + input.sourceId, ...input, createdAt: '', updatedAt: '',
  })),
}));
jest.mock('../../audio/catalogMappingCache', () => ({
  getCatalogMapping: jest.fn().mockResolvedValue(null),
  setCatalogMappingsBatch: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../stores/useTrackAvailabilityStore', () => ({
  clearTrackUnavailableMany: jest.fn(),
}));
jest.mock('../../../stores/useLibraryStore', () => ({
  useLibraryStore: { getState: () => ({ refreshLibrary: mockRefreshLibrary }) },
}));

const makeInput = () => ({
  id: 'local_playlist_001',
  title: 'Favoritas',
  description: 'Playlist enviada entre aparelhos',
  imageURL: 'https://images.example/cover.jpg',
  tracks: [
    {
      id: 'spotify-001', title: 'Música Um', subtitle: 'Artista Um',
      albumName: 'Álbum A', imageURL: 'https://images.example/track.jpg',
      durationMs: 185_000, youtubeVideoId: 'abcdefghijk',
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      artists: [{ id: 'artist-a', name: 'Artista Um' }],
      audioUrl: 'https://music.example/songs/um.mp3',
      albumAssociations: [{ id: 'album-a', name: 'Álbum A', trackNumber: 2 }],
      localAudioPath: 'file:///private/sandbox/um.m4a',
    },
    {
      id: 'spotify-002', title: 'Música Dois', subtitle: 'Artista Dois',
      albumName: 'Álbum B', durationMs: 200_000,
      streamUrl: 'https://rr.googlevideo.com/videoplayback?expire=1234&sig=secret',
    },
  ],
});

describe('playlist JSON exchange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCatalogMapping).mockResolvedValue(null);
  });

  it('restores remote mosaic covers when the exporting phone displays local artwork', async () => {
    const input = { ...makeInput(),
      imageURL: 'file:///private/sandbox/openfy_covers/cover.jpg',
      imageURLs: ['file:///private/sandbox/openfy_covers/cover.jpg'],
    };
    const json = await exportPlaylistJson(input);
    const exported = parsePlaylistJson(json);
    expect(exported.playlist.coverImageURLs).toContain('https://images.example/track.jpg');
    expect(json).not.toContain('file:///private');
  });

  it('copies ordered metadata and playable stable source references, never local files or signed URLs', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValueOnce({
      videoId: 'abcdefghijk', source: 'user_direct', confidence: 100, confirmedAt: Date.now(),
    });
    const json = await exportPlaylistJson(makeInput());
    const playlist = parsePlaylistJson(json);
    expect(playlist.format).toBe('openfy.playlist');
    expect(playlist.version).toBe(1);
    expect(playlist.playlist).toMatchObject({
      id: 'local_playlist_001', title: 'Favoritas', description: 'Playlist enviada entre aparelhos',
    });
    expect(playlist.tracks.map((track) => track.spotifyId)).toEqual(['spotify-001', 'spotify-002']);
    expect(playlist.tracks[0]).toMatchObject({
      youtubeVideoId: 'abcdefghijk',
      audioUrl: 'https://music.example/songs/um.mp3',
      sourceMapping: { videoId: 'abcdefghijk', source: 'user_direct' },
      albumAssociations: [{ id: 'album-a', name: 'Álbum A', trackNumber: 2 }],
    });
    expect(json).not.toContain('file:///');
    expect(json).not.toContain('sig=secret');
    expect(json).not.toContain('googlevideo');
  });

  it('imports without metadata lookup and restores source identities in a single batch', async () => {
    jest.mocked(getCatalogMapping).mockResolvedValueOnce({
      videoId: 'abcdefghijk', source: 'user_direct', confidence: 100, confirmedAt: Date.now(),
    });
    const json = await exportPlaylistJson(makeInput());
    const result = await importPlaylistJson(json);
    expect(result.trackCount).toBe(2);
    expect(upsertCatalogTracks).toHaveBeenCalledWith([
      expect.objectContaining({ spotifyId: 'spotify-001', title: 'Música Um',
        audioUrl: 'https://music.example/songs/um.mp3' }),
      expect.objectContaining({ spotifyId: 'spotify-002', title: 'Música Dois' }),
    ]);
    expect(setCatalogMappingsBatch).toHaveBeenCalledWith([
      expect.objectContaining({ spotifyId: 'spotify-001', mapping: expect.objectContaining({
        videoId: 'abcdefghijk', source: 'user_direct',
      }) }),
    ]);
    expect(clearTrackUnavailableMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ spotifyId: 'spotify-001' })])
    );
    expect(upsertLocalPlaylist).toHaveBeenCalledWith(expect.objectContaining({
      sourcePlatform: 'local', title: 'Favoritas', trackIds: ['spotify-001', 'spotify-002'],
    }));
    expect(mockRefreshLibrary).toHaveBeenCalledTimes(1);
  });

  it('reimporting the same document reuses its stable playlist ID', async () => {
    const json = await exportPlaylistJson(makeInput());
    await importPlaylistJson(json);
    await importPlaylistJson(json);
    const inputs = jest.mocked(upsertLocalPlaylist).mock.calls.map(([value]) => value);
    expect(inputs[0].sourceId).toBe(inputs[1].sourceId);
    expect(inputs[0].trackIds).toEqual(['spotify-001', 'spotify-002']);
  });

  it('rejects invalid formats, excessive payloads and duplicate IDs before writing anything', async () => {
    const valid = await exportPlaylistJson(makeInput());
    for (const invalid of [
      '{',
      JSON.stringify({ ...JSON.parse(valid), version: 2 }),
      JSON.stringify({ ...JSON.parse(valid), tracks: [
        JSON.parse(valid).tracks[0], JSON.parse(valid).tracks[0],
      ] }),
      'x'.repeat(3_000_001),
    ]) {
      await expect(importPlaylistJson(invalid)).rejects.toThrow();
    }
    expect(upsertCatalogTracks).not.toHaveBeenCalled();
    expect(upsertLocalPlaylist).not.toHaveBeenCalled();
  });
});
