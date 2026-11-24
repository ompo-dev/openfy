import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportMixJson, importMixJson, parseMixJson } from '../mixJsonTransfer';
import { getMixProjects, saveMixProject } from '../mixRepository';
import { upsertCatalogTracks } from '../../library/catalogLibrary';
import type { MixProject } from '../mixTimeline';

jest.mock('../../library/catalogLibrary', () => ({ upsertCatalogTracks: jest.fn().mockResolvedValue([]) }));
jest.mock('../../audio/catalogMappingCache', () => ({ getCatalogMapping: jest.fn().mockResolvedValue(null),
  setCatalogMappingsBatch: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../stores/useTrackAvailabilityStore', () => ({ clearTrackUnavailableMany: jest.fn() }));
const project: MixProject = { version: 1, id: 'local_mix_transfer', title: 'Treino', description: 'Edição', revision: 3,
  createdAt: '', updatedAt: '', tracks: [{ spotifyId: 'one', title: 'One', artistName: 'Artist', albumName: 'Album',
    imageURL: 'https://images.example/cover.jpg', duration_ms: 120000, explicit: true, youtubeVideoId: 'abcdefghijk' }],
  clips: [{ id: 'first', trackId: 'one', sourceStartMs: 1000, sourceEndMs: 31000, volume: 0.5 },
    { id: 'second', trackId: 'one', sourceStartMs: 45000, sourceEndMs: 60000, volume: 1, lane: 1 }] };

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

it('preserves ordered cuts, volume, metadata and known sources without copying private files', async () => {
  const json = await exportMixJson({ ...project, tracks: [{ ...project.tracks[0],
    localAudioPath: 'file:///private/audio.m4a', localImagePath: 'file:///private/cover.jpg' } as any] });
  expect(json).not.toContain('file:///private');
  expect(parseMixJson(json).clips).toEqual(project.clips);
  expect(parseMixJson(json).version).toBe(2);
  const { mix } = await importMixJson(json);
  expect(mix.clips).toEqual(project.clips);
  expect(mix.tracks[0]).toMatchObject({ explicit: true, youtubeVideoId: 'abcdefghijk' });
  expect(upsertCatalogTracks).toHaveBeenCalledTimes(1);
  await saveMixProject(mix, [mix.clips[0]], 'Minha edição');
  await importMixJson(json);
  expect(await getMixProjects()).toEqual([expect.objectContaining({ title: 'Minha edição', clips: [mix.clips[0]] })]);
});
it('keeps the original JSON version for single-lane mixes', async () => {
  const single = { ...project, clips: [project.clips[0]] };
  expect(parseMixJson(await exportMixJson(single))).toMatchObject({ version: 1, clips: single.clips });
});

it('rejects invalid ranges and unknown clip sources before changing storage', async () => {
  const doc = JSON.parse(await exportMixJson(project));
  doc.clips[0].sourceEndMs = 999999;
  await expect(importMixJson(JSON.stringify(doc))).rejects.toThrow();
  doc.clips[0].sourceEndMs = 31000; doc.clips[0].trackId = 'missing';
  await expect(importMixJson(JSON.stringify(doc))).rejects.toThrow();
  expect(upsertCatalogTracks).not.toHaveBeenCalled();
  expect(await getMixProjects()).toEqual([]);
});
