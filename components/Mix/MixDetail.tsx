import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { CollectionDetail } from '../CollectionDetail';
import { PendingCollectionDetail } from '../CollectionDetail/PendingCollectionDetail';
import { PlaylistTrackPickerModal } from '../LocalPlaylist/PlaylistTrackPickerModal';
import { MixEditor, type MixEditorHandle } from './MixEditorModal';
import { getLibraryTracks, type LibraryTrack } from '../../services/library/catalogLibrary';
import { addTracksToMix, deleteMixProject, getMixProject, saveMixProject } from '../../services/mix/mixRepository';
import { downloadMixSources, renderMixAudio } from '../../services/mix/mixAudio';
import { formatMixTime, mixDuration, type MixProject } from '../../services/mix/mixTimeline';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useConnectivityStore } from '../../stores/useConnectivityStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { log } from '../../utils/appLogger';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import { exportMixJson } from '../../services/mix/mixJsonTransfer';
import { pause } from '../../services/audio/playerService';
import { getExistingLocalAudioPath } from '../../services/download/localAudioPaths';
import { hasMixEffects } from '../../services/mix/mixEffects';

export function MixDetail({ mixId }: { mixId: string }) {
  const router = useRouter();
  const [project, setProject] = React.useState<MixProject | null>(null);
  const [library, setLibrary] = React.useState<LibraryTrack[]>([]);
  const [error, setError] = React.useState('');
  const [editor, setEditor] = React.useState(true);
  const [editorScrollLocked, setEditorScrollLocked] = React.useState(false);
  const editorRef = React.useRef<MixEditorHandle>(null);
  const [picker, setPicker] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const pending = React.useRef(false);
  const playbackGeneration = React.useRef(0);
  const generation = React.useRef(0);
  const sourceRequest = React.useRef(false);
  const focused = React.useRef(true);
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const revision = useLibraryStore((state) => state.libraryRevision);
  const connectivity = useConnectivityStore((state) => state.status);
  const load = React.useCallback(async () => {
    const request = ++generation.current;
    try {
      const [mix, tracks] = await Promise.all([getMixProject(mixId), getLibraryTracks()]);
      if (request !== generation.current) return;
      setProject((current) => current && mix && current.id === mix.id && current.revision > mix.revision ? current : mix);
      setLibrary(tracks); setError(mix ? '' : 'Mix não encontrado.');
    } catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o mix.'); }
  }, [mixId]);
  useFocusEffect(React.useCallback(() => { focused.current = true; void load(); return () => {
    focused.current = false; generation.current++; playbackGeneration.current++; editorRef.current?.stop();
  }; }, [load]));
  React.useEffect(() => { void load(); }, [revision, load]);
  React.useEffect(() => {
    if (!project || sourceRequest.current) return;
    sourceRequest.current = true;
    void downloadMixSources(project, library).catch((reason) => log.error('mix source download failed', { mixId, error: reason }))
      .finally(() => { sourceRequest.current = false; });
  }, [project, library, connectivity, mixId]);
  React.useEffect(() => {
    if (!project?.clips.length || !focused.current) return;
    const downloaded = new Set(library.filter((track) => track.isDownloaded && track.localAudioPath).map((track) => track.spotifyId));
    const durations = new Map(project.tracks.map((track) => [track.spotifyId, track.duration_ms]));
    if (!project.clips.every((clip) => downloaded.has(clip.trackId))) return;
    if (project.clips.every((clip) => !hasMixEffects(clip) && !(clip.lane ?? 0) && !(clip.gapBeforeMs ?? 0) && clip.volume === 1 &&
      clip.sourceStartMs === 0 && clip.sourceEndMs === durations.get(clip.trackId))) return;
    const timer = setTimeout(() => {
      if (focused.current && !pending.current && !editorRef.current?.hasPendingEdits()) void renderMixAudio(project).catch((error) =>
        log.error('mix background composition failed', { mixId, error }));
    }, 400);
    return () => clearTimeout(timer);
  }, [project, library, mixId]);
  const refresh = () => useLibraryStore.getState().refreshLibrary();
  const allowSavedAction = async () => {
    if (!editorRef.current || await editorRef.current.flush()) return true;
    Alert.alert('Mix', 'Não foi possível salvar as alterações. Tente novamente no editor.');
    return false;
  };
  const add = async (ids: string[]) => {
    if (!await allowSavedAction()) return;
    try {
      const byId = new Map(library.map((track) => [track.spotifyId, track]));
      const selected = ids.map((id) => byId.get(id)).filter((track): track is LibraryTrack => Boolean(track?.isDownloaded && track.localAudioPath));
      if (selected.length !== ids.length || (await Promise.all(selected.map((track) => getExistingLocalAudioPath(track.localAudioPath, 0)))).some((path) => !path)) {
        throw new Error('Baixe as músicas antes de adicioná-las ao mix.');
      }
      const saved = await addTracksToMix(mixId, selected);
      setProject(saved); refresh();
    } catch (reason) { Alert.alert('Mix', reason instanceof Error ? reason.message : 'Não foi possível adicionar as músicas.'); }
  };
  const play = async (trackId?: string) => {
    if (trackId) {
      const source = projectRef.current?.tracks.find((track) => track.spotifyId === trackId);
      if (!source) return;
      editorRef.current?.stop();
      const request = ++playbackGeneration.current;
      try {
        const track = mergeMixTrack(source, library.find((item) => item.spotifyId === trackId));
        const path = await getExistingLocalAudioPath(track.localAudioPath, 0);
        if (request !== playbackGeneration.current || !focused.current) return;
        await usePlayerStore.getState().playWithQueue([{ ...track, ...(path ? { localAudioPath: path } : {}) }], 0, `mix-source:${mixId}:${trackId}`);
      } catch (reason) { Alert.alert('Mix', reason instanceof Error ? reason.message : 'Não foi possível tocar a música.'); }
      return;
    }
    if (pending.current || !await allowSavedAction()) return;
    const project = projectRef.current;
    if (!project || !project.clips.length) return;
    editorRef.current?.stop();
    pending.current = true; setPreparing(true);
    const request = ++playbackGeneration.current;
    const expectedRevision = project.revision;
    try {
      const byId = new Map(library.map((track) => [track.spotifyId, track]));
      const metadata = new Map(project.tracks.map((track) => [track.spotifyId, track]));
      const plain = project.clips.length > 0 && project.clips.every((clip) =>
        !hasMixEffects(clip) && !(clip.lane ?? 0) && !(clip.gapBeforeMs ?? 0) && clip.volume === 1 && clip.sourceStartMs === 0 &&
        clip.sourceEndMs === metadata.get(clip.trackId)?.duration_ms && byId.get(clip.trackId)?.localAudioPath);
      if (plain) {
        const queue = project.clips.map((clip) => ({ ...mergeMixTrack(metadata.get(clip.trackId)!, byId.get(clip.trackId)), localOnly: true }));
        const paths = await Promise.all(queue.map((track) => getExistingLocalAudioPath(track.localAudioPath, 0)));
        if (paths.every(Boolean)) {
          if (request !== playbackGeneration.current || !focused.current || projectRef.current?.revision !== expectedRevision) return;
          await usePlayerStore.getState().playWithQueue(queue.map((track, index) => ({ ...track, localAudioPath: paths[index]! })),
            0, `playlist:${mixId}:revision:${project.revision}`);
          if (request !== playbackGeneration.current && usePlayerStore.getState().queueSourceId === `playlist:${mixId}:revision:${project.revision}`) await pause('mix-editor-interrupted-start');
          return;
        }
      }
      if (!project.clips.every((clip) => byId.get(clip.trackId)?.localAudioPath)) await downloadMixSources(project);
      const output = await renderMixAudio(project);
      if (request !== playbackGeneration.current || !focused.current || projectRef.current?.revision !== expectedRevision) return;
      const cover = project.tracks.find((track) => track.spotifyId === project.clips[0]?.trackId);
      const player = usePlayerStore.getState();
      await player.playWithQueue([{
        spotifyId: `${mixId}_render_${project.revision}`, title: project.title,
        artistName: [...new Set(project.tracks.map((track) => track.artistName))].join(' · '), albumName: 'Mix',
        imageURL: (cover && (byId.get(cover.spotifyId)?.localImagePath || byId.get(cover.spotifyId)?.imageURL || cover.imageURL)) || '',
        explicit: project.tracks.some((track) => (byId.get(track.spotifyId)?.explicit ?? track.explicit) === true),
        localAudioPath: output.uri, localOnly: true, duration_ms: output.durationMs,
      }], 0, `playlist:${mixId}:revision:${project.revision}`);
      if (request !== playbackGeneration.current) {
        if (usePlayerStore.getState().queueSourceId === `playlist:${mixId}:revision:${project.revision}`) {
          await pause('mix-editor-interrupted-start');
        }
        return;
      }
    } catch (reason) {
      log.error('mix playback failed', { mixId, error: reason });
      Alert.alert('Mix', reason instanceof Error ? reason.message : 'Não foi possível tocar o mix.');
    } finally { pending.current = false; setPreparing(false); }
  };
  if (!project) return <PendingCollectionDetail kind="playlist" collectionId={mixId} error={error} onRetry={() => void load()} />;
  const sourceIds = [...new Set(project.clips.map((clip) => clip.trackId))];
  const byId = new Map(library.map((track) => [track.spotifyId, track]));
  const sources = project.tracks.map((track) => mergeMixTrack(track, byId.get(track.spotifyId)));
  const sourcesById = new Map(sources.map((track) => [track.spotifyId, track]));
  const tracks = sourceIds.map((id) => sourcesById.get(id)!).map((track) => ({
    ...track,
    id: track.spotifyId, title: track.title, subtitle: track.artistName, albumName: track.albumName,
    durationMs: track.duration_ms,
  }));
  const covers = tracks.map((track) => track.localImagePath || track.imageURL).filter(Boolean).slice(0, 4);
  const pickerModal = <PlaylistTrackPickerModal visible={picker} tracks={library.filter((track) => track.isDownloaded && track.localAudioPath)} existingTrackIds={sourceIds}
    onClose={() => setPicker(false)} onConfirm={(ids) => void add(ids)} />;
  const openEditor = () => {
    if (editor) { editorRef.current?.close(); return; }
    playbackGeneration.current++;
    if (usePlayerStore.getState().queueSourceId?.startsWith(`playlist:${mixId}:revision:`)) {
      void pause('mix-editor-open').catch((error) => log.error('mix editor open pause failed', { mixId, error }));
    }
    setEditor(true);
  };
  const closeEditor = () => {
    playbackGeneration.current++;
    setEditor(false); setEditorScrollLocked(false); setPicker(false);
    const player = usePlayerStore.getState();
    // Do not stop unrelated music when dismissing the editor.
    if (player.queueSourceId?.startsWith(`playlist:${mixId}:revision:`)) {
      const sourceId = player.queueSourceId;
      void pause('mix-editor-close').then(() => {
        if (usePlayerStore.getState().queueSourceId === sourceId) {
          usePlayerStore.setState((state) => ({ playerState: { ...state.playerState, isPlaying: false } }));
        }
      }).catch((reason) => log.error('mix editor pause failed', { mixId, error: reason }));
    }
  };
  return <>
    <CollectionDetail kind="playlist" collectionId={mixId} title={project.title} description={project.description}
      playbackSourceId={`playlist:${mixId}:revision:${project.revision}`}
      imageURL={covers[0] || ''} imageURLs={covers}
      metadata={`Mix · ${project.clips.length} clipes · ${formatMixTime(mixDuration(project.clips))}`}
      trackCount={tracks.length} totalDurationMs={mixDuration(project.clips)} tracks={tracks} disableTrackArtistLinks
      onPlayMix={play} onOpenMixEditor={openEditor} onEditPress={openEditor}
      beforeTracks={editor ? <MixEditor key={project.id} project={project} library={library} editorRef={editorRef} onClose={closeEditor}
        onSaved={(mix) => { if (projectRef.current?.id === mix.id) { projectRef.current = mix; setProject(mix); } }} onGestureActive={setEditorScrollLocked}
        onPreviewStart={() => { playbackGeneration.current++; }} /> : undefined}
      lockScroll={editorScrollLocked} onBeforeBack={allowSavedAction}
      onShareMix={async () => {
        if (!await allowSavedAction()) return;
        const latest = projectRef.current;
        if (!latest) return;
        await Clipboard.setStringAsync(await exportMixJson({ ...latest, tracks: latest.tracks.map((track) => mergeMixTrack(track, byId.get(track.spotifyId))) }));
        Alert.alert('Mix copiado', 'Músicas, cortes, ordem e volumes copiados. Importe o JSON nas Configurações.');
      }}
      onAddTracksPress={async () => { if (await allowSavedAction()) setPicker(true); }} onRefresh={async () => { if (await allowSavedAction()) return load(); }} loadingError={error}
      onRemoveTrack={async (trackId) => {
        if (!await allowSavedAction()) return;
        const latest = projectRef.current;
        if (!latest) return;
        void saveMixProject(latest, latest.clips.filter((clip) => clip.trackId !== trackId))
          .then((saved) => { setProject(saved); refresh(); })
          .catch((reason) => Alert.alert('Mix', String(reason)));
      }}
      onDeletePress={async () => { if (await allowSavedAction()) Alert.alert('Excluir mix?', 'As músicas baixadas continuarão na biblioteca.', [
        { text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => {
          void deleteMixProject(mixId).then(() => { refresh(); router.replace('/(tabs)/library'); })
            .catch(() => Alert.alert('Mix', 'Não foi possível excluir o mix.'));
        } },
      ]); }}
      footer={preparing ? <View style={S.status}><Text style={S.text}>Preparando mix…</Text></View> : undefined} />
    {pickerModal}
  </>;
}
const S = StyleSheet.create({ status: { padding: 20 }, text: { color: '#ABABB2', textAlign: 'center' } });
