import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeCommand } from '../../src/application/commandBus';
import { createMixId, validateMixClips, type MixClip, type MixProject } from './mixTimeline';
import type { CatalogTrackInput } from '../library/catalogLibrary';

const KEY = 'openfy_mix_projects_v1';
let mutation = Promise.resolve();

const validProject = (value: unknown): value is MixProject => {
  try {
    const mix = value as MixProject;
    if (mix.version !== 1 || typeof mix.id !== 'string' || !mix.id.startsWith('local_mix_') ||
      typeof mix.title !== 'string' || typeof mix.description !== 'string' ||
      !Number.isSafeInteger(mix.revision) || mix.revision < 1 || !Array.isArray(mix.tracks) ||
      !Array.isArray(mix.clips) || typeof mix.createdAt !== 'string' || typeof mix.updatedAt !== 'string' ||
      mix.tracks.some((track) => !track.spotifyId || typeof track.title !== 'string' ||
        !Number.isFinite(track.duration_ms) || track.duration_ms < 100)) return false;
    validateMixClips(mix.clips, mix.tracks);
    return true;
  } catch { return false; }
};

export const getMixProjects = async (): Promise<MixProject[]> => {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(validProject)) throw new Error('Não foi possível ler os mixes salvos.');
  return parsed;
};
export const getMixProject = async (id: string) => (await getMixProjects()).find((mix) => mix.id === id) || null;

const mutate = <T,>(name: string, id: string, change: (items: MixProject[]) => { items: MixProject[]; result: T }): Promise<T> =>
  executeCommand({ name: `mix.${name}`, category: 'playlist', idempotencyKey: id, successTtlMs: 0, execute: async () => {
    let result!: T;
    const operation = mutation.then(async () => {
      const next = change(await getMixProjects());
      await AsyncStorage.setItem(KEY, JSON.stringify(next.items));
      result = next.result;
    });
    mutation = operation.catch(() => {});
    await operation;
    return result;
  } });

export const createMixProject = (title: string, description = '') => {
  const id = `local_mix_${createMixId()}`;
  return mutate('create', id, (items) => {
    if (!title.trim()) throw new Error('Informe o nome do mix.');
    const now = new Date().toISOString();
    const result: MixProject = { version: 1, id, title: title.trim().slice(0, 80), description: description.trim().slice(0, 240),
      revision: 1, tracks: [], clips: [], createdAt: now, updatedAt: now };
    return { items: [...items, result], result };
  });
};

const replaceMix = (items: MixProject[], current: MixProject, update: Partial<MixProject>) => {
  const result = { ...current, ...update, revision: current.revision + 1, updatedAt: new Date().toISOString() };
  validateMixClips(result.clips, result.tracks);
  return { items: items.map((mix) => mix.id === current.id ? result : mix), result };
};

export const addTracksToMix = (id: string, tracks: CatalogTrackInput[]) => mutate('tracks.add', `${id}:${tracks.map((t) => t.spotifyId).join(',')}`, (items) => {
  const current = items.find((mix) => mix.id === id);
  if (!current) throw new Error('Mix não encontrado.');
  const additions = tracks.filter((track, index) => !current.clips.some((item) => item.trackId === track.spotifyId) &&
    tracks.findIndex((item) => item.spotifyId === track.spotifyId) === index);
  if (additions.some((track) => !track.spotifyId || !Number.isFinite(track.duration_ms) || track.duration_ms < 100)) {
    throw new Error('A duração da música precisa estar disponível para editar o áudio.');
  }
  return replaceMix(items, current, { tracks: [...new Map([...current.tracks, ...additions].map((track) => [track.spotifyId, track])).values()], clips: [...current.clips,
    ...additions.map((track) => ({ id: createMixId(), trackId: track.spotifyId, sourceStartMs: 0, sourceEndMs: Math.floor(track.duration_ms), volume: 1 }))] });
});

export const saveMixProject = (project: MixProject, clips: MixClip[], title = project.title, description = project.description) =>
  mutate('save', `${project.id}:${project.revision}:${JSON.stringify([clips, title, description])}`, (items) => {
    const current = items.find((mix) => mix.id === project.id);
    if (!current) throw new Error('Mix não encontrado.');
    if (current.revision !== project.revision) throw new Error('O mix mudou. Feche e abra o editor para carregar a versão mais recente.');
    if (!title.trim()) throw new Error('Informe o nome do mix.');
    const used = new Set(clips.map((clip) => clip.trackId));
    return replaceMix(items, current, { clips, tracks: current.tracks.filter((track) => used.has(track.spotifyId)),
      title: title.trim().slice(0, 80), description: description.trim().slice(0, 240) });
  });

export const deleteMixProject = (id: string) => mutate('delete', id, (items) => ({ items: items.filter((mix) => mix.id !== id), result: undefined }));
