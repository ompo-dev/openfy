import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getLibraryTracks, toDownloadTrackInput, type LibraryTrack } from '../library/catalogLibrary';
import { useDownloadStore } from '../../stores/useDownloadStore';
import { log } from '../../utils/appLogger';
import { validateMixClips, type MixProject } from './mixTimeline';
import { prepareLocalAudioForPlayback } from '../audio/localAudioRepair';
import { currentManagedAudioPath } from '../download/localAudioPaths';
import { mergeMixTrack } from './mixTrackMetadata';
import { stableDirectAudioUrl } from '../audio/stableAudioUrl';

export type MixAudioClip = { uri: string; startMs: number; endMs: number; volume: number; lane?: number; gapBeforeMs?: number };
type MixRender = { uri: string; durationMs: number };
type MixModule = { renderMixAsync(clips: MixAudioClip[], outputUri: string): Promise<MixRender>; supportsMixLanes?: boolean; supportsMixGaps?: boolean };
const inFlight = new Map<string, Promise<MixRender>>();
const cached = new Map<string, { signature: string; result: MixRender }>();

export const hasMixRenderer = () => typeof requireOptionalNativeModule<MixModule>('OpenfyLocalAudio')?.renderMixAsync === 'function';
export const existingMixFile = async (uri?: string) => {
  if (!uri?.startsWith('file://')) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && info.size > 0;
  } catch { return false; }
};

const localSource = async (uri?: string) => {
  const rebased = currentManagedAudioPath(uri);
  for (const path of new Set([rebased, uri])) {
    if (path && await existingMixFile(path)) return path;
  }
  return null;
};

export const downloadMixSources = async (project: MixProject, library?: LibraryTrack[]) => {
  const tracks = library || await getLibraryTracks();
  const byId = new Map(tracks.map((track) => [track.spotifyId, track]));
  const sourceIds = new Set(project.clips.map((clip) => clip.trackId));
  const missing = [];
  for (const track of project.tracks) {
    if (sourceIds.has(track.spotifyId) && !await localSource(byId.get(track.spotifyId)?.localAudioPath)) {
      const source = mergeMixTrack(track, byId.get(track.spotifyId));
      const direct = stableDirectAudioUrl(source.audioUrl) || stableDirectAudioUrl(source.streamUrl);
      missing.push({ ...toDownloadTrackInput(source), preferLinkedSource: true,
        ...(direct ? { audioUrl: direct.url, audioFormat: direct.format } : {}) });
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
  if (project.clips.some((clip) => (clip.gapBeforeMs ?? 0) > 0) && !native.supportsMixGaps) {
    throw new Error('Atualize o IPA ou APK para reproduzir mixes com espaços entre clipes.');
  }
  if (project.clips.some((clip) => (clip.lane ?? 0) > 0) && !native.supportsMixLanes) {
    throw new Error('Atualize o IPA ou APK para reproduzir mixes com várias faixas de áudio.');
  }
  const tracks = new Map((await getLibraryTracks()).map((track) => [track.spotifyId, track]));
  const clips: MixAudioClip[] = [];
  const identities: unknown[] = [];
  const prepared = new Map<string, { uri: string; identity: unknown }>();
  for (const clip of project.clips) {
    let source = prepared.get(clip.trackId);
    if (!source) {
      const local = await localSource(tracks.get(clip.trackId)?.localAudioPath);
      if (!local) throw new Error('Baixe todas as músicas do mix antes de reproduzir.');
      const info = await FileSystem.getInfoAsync(local);
      source = { uri: local, identity: info.exists ? [local, info.size, info.modificationTime] : [local] };
      prepared.set(clip.trackId, source);
    }
    identities.push(source.identity);
    clips.push({ uri: source.uri, startMs: clip.sourceStartMs, endMs: clip.sourceEndMs, volume: clip.volume,
      ...(clip.lane ? { lane: clip.lane } : {}), ...(clip.gapBeforeMs ? { gapBeforeMs: clip.gapBeforeMs } : {}) });
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
      // Repair each distinct source only on a cache miss, not for each clip.
      const repairedSources = new Map<string, string>();
      for (const clip of clips) {
        if (!repairedSources.has(clip.uri)) {
          const repair = await prepareLocalAudioForPlayback(clip.uri);
          repairedSources.set(clip.uri, repair?.uri || clip.uri);
        }
      }
      const result = await native.renderMixAsync(clips.map((clip) => ({ ...clip, uri: repairedSources.get(clip.uri)! })), uri);
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
