import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getLibraryTracks, toDownloadTrackInput, type LibraryTrack } from '../library/catalogLibrary';
import { useDownloadStore } from '../../stores/useDownloadStore';
import { log } from '../../utils/appLogger';
import { validateMixClips, type MixProject } from './mixTimeline';
import { prepareLocalAudioForPlayback } from '../audio/localAudioRepair';

export type MixAudioClip = { uri: string; startMs: number; endMs: number; volume: number };
type MixRender = { uri: string; durationMs: number };
type MixModule = { renderMixAsync(clips: MixAudioClip[], outputUri: string): Promise<MixRender> };
const inFlight = new Map<string, Promise<MixRender>>();
const cached = new Map<string, { signature: string; result: MixRender }>();

export const hasMixRenderer = () => typeof requireOptionalNativeModule<MixModule>('OpenfyLocalAudio')?.renderMixAsync === 'function';
export const existingMixFile = async (uri?: string) => {
  if (!uri?.startsWith('file://')) return false;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory && info.size > 0;
};

export const downloadMixSources = async (project: MixProject, library?: LibraryTrack[]) => {
  const tracks = library || await getLibraryTracks();
  const byId = new Map(tracks.map((track) => [track.spotifyId, track]));
  const sourceIds = new Set(project.clips.map((clip) => clip.trackId));
  const missing = [];
  for (const track of project.tracks) {
    if (sourceIds.has(track.spotifyId) && !await existingMixFile(byId.get(track.spotifyId)?.localAudioPath)) {
      missing.push(toDownloadTrackInput({ ...track, ...byId.get(track.spotifyId) }));
    }
  }
  log.download('mix source downloads requested', { mixId: project.id, missing: missing.length });
  await useDownloadStore.getState().ensureDownloads(missing);
};

export const renderMixAudio = async (project: MixProject): Promise<MixRender> => {
  validateMixClips(project.clips, project.tracks);
  if (!project.clips.length) throw new Error('Adicione músicas ao mix.');
  const native = requireOptionalNativeModule<MixModule>('OpenfyLocalAudio');
  if (!native?.renderMixAsync) throw new Error('Instale o novo IPA ou APK para usar o editor de áudio.');
  const tracks = new Map((await getLibraryTracks()).map((track) => [track.spotifyId, track]));
  const clips: MixAudioClip[] = [];
  const identities: unknown[] = [];
  for (const clip of project.clips) {
    let uri = tracks.get(clip.trackId)?.localAudioPath;
    if (!await existingMixFile(uri)) throw new Error('Baixe todas as músicas do mix antes de reproduzir.');
    const repaired = await prepareLocalAudioForPlayback(uri!);
    uri = repaired?.uri || uri!;
    const info = await FileSystem.getInfoAsync(uri);
    identities.push(info.exists ? [uri, info.size, info.modificationTime] : [uri]);
    clips.push({ uri, startMs: clip.sourceStartMs, endMs: clip.sourceEndMs, volume: clip.volume });
  }
  const signature = JSON.stringify([clips, identities]);
  const storageKey = `openfy_mix_render_${project.id}`;
  const stored = cached.has(project.id) ? null : await AsyncStorage.getItem(storageKey).catch(() => null);
  let persisted: { signature: string; result: MixRender } | undefined;
  try { persisted = stored ? JSON.parse(stored) : undefined; } catch { /* An evicted cache is regenerated. */ }
  const cachedResult = cached.get(project.id) || persisted;
  if (cachedResult?.signature === signature && cachedResult.result?.durationMs > 0 &&
    await existingMixFile(cachedResult.result?.uri)) return cachedResult.result;
  const key = `${project.id}:${signature}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const operation = (async () => {
    const finish = log.time('player', 'mix audio composition', { mixId: project.id, clips: clips.length });
    const directory = `${FileSystem.cacheDirectory}openfy-mixes/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const uri = `${directory}${Date.now()}_${Math.random().toString(36).slice(2)}.m4a`;
    try {
      const result = await native.renderMixAsync(clips, uri);
      if (!Number.isFinite(result.durationMs) || result.durationMs <= 0 || result.uri !== uri || !await existingMixFile(uri)) {
        throw new Error('A composição de áudio não foi concluída.');
      }
      cached.set(project.id, { signature, result });
      await AsyncStorage.setItem(storageKey, JSON.stringify({ signature, result })).catch((error) => log.error('mix render cache save failed', { error }));
      finish({ ok: true, durationMs: result.durationMs });
      return result;
    } catch (error) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      finish({ ok: false, error });
      throw error;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
};
