import AsyncStorage from '@react-native-async-storage/async-storage';
import { addTracksToMix, createMixProject, deleteMixProject, getMixProject, getMixProjects, saveMixProject } from '../mixRepository';
import type { CatalogTrackInput } from '../../library/catalogLibrary';
const track = (id: string): CatalogTrackInput => ({ spotifyId: id, title: id, artistName: 'Artist', albumName: '', imageURL: '', duration_ms: 60000 });
beforeEach(async () => { await AsyncStorage.clear(); });

it('serializes concurrent inclusions, prevents duplicate songs and persists across reads', async () => {
  const mix = await createMixProject('  Treino  ');
  await Promise.all([addTracksToMix(mix.id, [track('one')]), addTracksToMix(mix.id, [track('two'), track('one')])]);
  const loaded = (await getMixProject(mix.id))!;
  expect(loaded.title).toBe('Treino');
  expect(loaded.clips.map((clip) => clip.trackId)).toEqual(['one', 'two']);
  expect(loaded.tracks.map((source) => source.spotifyId)).toEqual(['one', 'two']);
  expect(loaded.revision).toBe(3);
});
it('saves trims non-destructively and can re-add a previously removed source', async () => {
  let mix = await createMixProject('Mix');
  mix = await addTracksToMix(mix.id, [track('one')]);
  mix = await saveMixProject(mix, [{ ...mix.clips[0], sourceStartMs: 10000, sourceEndMs: 20000 }]);
  expect(mix.tracks[0].duration_ms).toBe(60000);
  mix = await saveMixProject(mix, []);
  mix = await addTracksToMix(mix.id, [track('one')]);
  expect(mix.clips).toHaveLength(1); expect(mix.tracks).toHaveLength(1);
});
it('rejects stale editors instead of overwriting newly added songs', async () => {
  const mix = await createMixProject('Mix');
  await addTracksToMix(mix.id, [track('one')]);
  await expect(saveMixProject(mix, [])).rejects.toThrow('O mix mudou');
  expect((await getMixProject(mix.id))?.clips).toHaveLength(1);
});
it('preserves storage on corrupt or unreadable data', async () => {
  await AsyncStorage.setItem('openfy_mix_projects_v1', '{bad');
  await expect(createMixProject('new')).rejects.toThrow();
  expect(await AsyncStorage.getItem('openfy_mix_projects_v1')).toBe('{bad');
  await AsyncStorage.setItem('openfy_mix_projects_v1', JSON.stringify([{ version: 77 }]));
  await expect(getMixProjects()).rejects.toThrow('Não foi possível ler');
});
it('deletes only the mix document and leaves playlists and downloads intact', async () => {
  const first = await createMixProject('First');
  const second = await createMixProject('Second');
  await AsyncStorage.setItem('openfy_local_playlists', 'playlist-sentinel');
  await deleteMixProject(first.id);
  expect((await getMixProjects()).map((mix) => mix.id)).toEqual([second.id]);
  expect(await AsyncStorage.getItem('openfy_local_playlists')).toBe('playlist-sentinel');
});
