import { exportPlaylistJson, parsePlaylistJson, restorePortableTracks, MAX_PLAYLIST_JSON_LENGTH,
  type PortablePlaylist } from '../library/playlistJsonTransfer';
import { importMixProject } from './mixRepository';
import { validateMixClips, type MixClip, type MixProject } from './mixTimeline';
import { useLibraryStore } from '../../stores/useLibraryStore';

type PortableMix = { format: 'openfy.mix'; version: 1 | 2 | 3 | 4; sources: PortablePlaylist; clips: MixClip[] };

export const exportMixJson = async (project: MixProject): Promise<string> => {
  validateMixClips(project.clips, project.tracks);
  const sources = parsePlaylistJson(await exportPlaylistJson({ id: project.id, title: project.title,
    description: project.description, createdAt: project.createdAt, tracks: project.tracks }));
  const version = project.clips.some((clip) => clip.fadeInMs !== undefined || clip.fadeOutMs !== undefined || clip.duckAmount !== undefined || clip.beatsMs !== undefined) ? 4 :
    project.clips.some((clip) => (clip.gapBeforeMs ?? 0) > 0) ? 3 : project.clips.some((clip) => (clip.lane ?? 0) > 0) ? 2 : 1;
  const raw = JSON.stringify({ format: 'openfy.mix', version, sources,
    clips: project.clips.map(({ id, trackId, sourceStartMs, sourceEndMs, volume, lane, gapBeforeMs, fadeInMs, fadeOutMs, duckAmount, beatsMs }) =>
      ({ id, trackId, sourceStartMs, sourceEndMs, volume, ...(lane === undefined ? {} : { lane }),
        ...(gapBeforeMs === undefined ? {} : { gapBeforeMs }), fadeInMs, fadeOutMs, duckAmount, beatsMs })) } satisfies PortableMix, null, 2);
  if (raw.length > MAX_PLAYLIST_JSON_LENGTH) throw new Error('JSON excede o limite de 3 MB.');
  return raw;
};

export const parseMixJson = (raw: string): PortableMix => {
  if (raw.length > MAX_PLAYLIST_JSON_LENGTH) throw new Error('JSON excede o limite de 3 MB.');
  const data = JSON.parse(raw) as Partial<PortableMix> | null;
  if (!data || data.format !== 'openfy.mix' || (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) || !data.sources || !Array.isArray(data.clips)) {
    throw new Error('Formato ou versão de mix inválidos.');
  }
  const sources = parsePlaylistJson(JSON.stringify(data.sources));
  if (sources.tracks.some((track) => track.duration_ms < 100)) throw new Error('Duração de fonte inválida.');
  const clips = data.clips.map((clip) => {
    if (!clip || typeof clip.id !== 'string' || typeof clip.trackId !== 'string' || clip.id.length > 256) {
      throw new Error('Clipe inválido.');
    }
    const { id, trackId, sourceStartMs, sourceEndMs, volume, lane, gapBeforeMs, fadeInMs, fadeOutMs, duckAmount, beatsMs } = clip;
    if (data.version! < 3 && gapBeforeMs) throw new Error('Versão do mix incompatível com espaços de áudio.');
    if (data.version !== 4 && [fadeInMs, fadeOutMs, duckAmount, beatsMs].some((value) => value !== undefined)) throw new Error('Versão do mix incompatível com efeitos.');
    return { id, trackId, sourceStartMs, sourceEndMs, volume, ...(lane === undefined ? {} : { lane }),
      ...(gapBeforeMs === undefined ? {} : { gapBeforeMs }), ...(fadeInMs === undefined ? {} : { fadeInMs }),
      ...(fadeOutMs === undefined ? {} : { fadeOutMs }), ...(duckAmount === undefined ? {} : { duckAmount }),
      ...(beatsMs === undefined ? {} : { beatsMs }) };
  });
  validateMixClips(clips, sources.tracks);
  return { format: 'openfy.mix', version: data.version, sources, clips };
};

export const importMixJson = async (raw: string): Promise<{ mix: MixProject; trackCount: number }> => {
  const doc = parseMixJson(raw);
  const tracks = await restorePortableTracks(doc.sources);
  const mix = await importMixProject({ id: doc.sources.playlist.id, title: doc.sources.playlist.title,
    description: doc.sources.playlist.description || '', tracks, clips: doc.clips });
  useLibraryStore.getState().refreshLibrary();
  return { mix, trackCount: tracks.length };
};
