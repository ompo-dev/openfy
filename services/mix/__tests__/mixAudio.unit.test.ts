import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getLibraryTracks } from '../../library/catalogLibrary';
import { downloadMixSources, renderMixAudio } from '../mixAudio';
import type { MixProject } from '../mixTimeline';
const mockEnsure = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../stores/useDownloadStore', () => ({ useDownloadStore: { getState: () => ({ ensureDownloads: mockEnsure }) } }));
jest.mock('../../library/catalogLibrary', () => ({ getLibraryTracks: jest.fn(), toDownloadTrackInput: (track: unknown) => track }));
jest.mock('../../audio/localAudioRepair', () => ({ prepareLocalAudioForPlayback: jest.fn().mockResolvedValue(null) }));
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined), deleteAsync: jest.fn().mockResolvedValue(undefined) }));
const mockRender = jest.fn();
const project = (id: string): MixProject => ({ version: 1, id: `local_mix_${id}`, title: 'Mix', description: '', revision: 1,
  createdAt: '', updatedAt: '', tracks: [{ spotifyId: 'one', title: 'One', artistName: 'Artist', albumName: '', imageURL: '', duration_ms: 60000 }],
  clips: [{ id: 'clip', trackId: 'one', sourceStartMs: 10000, sourceEndMs: 20000, volume: 0.5 }] });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ renderMixAsync: mockRender } as never);
  jest.mocked(getLibraryTracks).mockResolvedValue([{ spotifyId: 'one', localAudioPath: 'file:///one.m4a' }] as never);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 200, modificationTime: 1, isDirectory: false } as never);
  mockRender.mockImplementation(async (_clips, uri) => ({ uri, durationMs: 10000 }));
});
it('passes exact cuts and gain to the native renderer using only local files', async () => {
  const mix = project('cuts');
  const output = await renderMixAudio(mix);
  expect(mockRender).toHaveBeenCalledWith([{ uri: 'file:///one.m4a', startMs: 10000, endMs: 20000, volume: 0.5 }], output.uri);
  await renderMixAudio(mix);
  expect(mockRender).toHaveBeenCalledTimes(1);
  await renderMixAudio({ ...mix, clips: [{ ...mix.clips[0], sourceStartMs: 12000 }] });
  expect(mockRender).toHaveBeenCalledTimes(2);
});
it('rejects absent or remote sources without attempting a streamed composition', async () => {
  jest.mocked(getLibraryTracks).mockResolvedValue([{ spotifyId: 'one', localAudioPath: 'https://youtube.com/audio' }] as never);
  await expect(renderMixAudio(project('remote'))).rejects.toThrow('Baixe todas');
  expect(mockRender).not.toHaveBeenCalled();
});
it('queues missing sources automatically, but reuses valid downloaded files', async () => {
  const mix = project('download');
  await downloadMixSources(mix);
  expect(mockEnsure).toHaveBeenLastCalledWith([]);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: false } as never);
  await downloadMixSources(mix);
  expect(mockEnsure).toHaveBeenLastCalledWith([expect.objectContaining(mix.tracks[0])]);
});
it('uses a corrected catalog YouTube source when a mix needs to re-download an original', async () => {
  jest.mocked(getLibraryTracks).mockResolvedValue([{ spotifyId: 'one', youtubeVideoId: 'corrected', youtubeUrl: 'https://youtube.com/watch?v=corrected' }] as never);
  await downloadMixSources(project('corrected'));
  expect(mockEnsure).toHaveBeenCalledWith([expect.objectContaining({ spotifyId: 'one', youtubeVideoId: 'corrected' })]);
});
it('reports old native builds and cleans up failed output files', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  await expect(renderMixAudio(project('old'))).rejects.toThrow('novo IPA ou APK');
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ renderMixAsync: mockRender } as never);
  mockRender.mockRejectedValue(new Error('encoder'));
  await expect(renderMixAudio(project('failed'))).rejects.toThrow('encoder');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('file:///cache/openfy-mixes/'), { idempotent: true });
});
it('coalesces concurrent renders of the same edit', async () => {
  await Promise.all([renderMixAudio(project('coalesce')), renderMixAudio(project('coalesce'))]);
  expect(mockRender).toHaveBeenCalledTimes(1);
});
