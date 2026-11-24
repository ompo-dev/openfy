import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { CollectionDetail } from '../CollectionDetail';
import { PendingCollectionDetail } from '../CollectionDetail/PendingCollectionDetail';
import { PlaylistTrackPickerModal } from '../LocalPlaylist/PlaylistTrackPickerModal';
import { MixEditorModal } from './MixEditorModal';
import { getLibraryTracks, type LibraryTrack } from '../../services/library/catalogLibrary';
import { addTracksToMix, deleteMixProject, getMixProject, saveMixProject } from '../../services/mix/mixRepository';
import { downloadMixSources, renderMixAudio } from '../../services/mix/mixAudio';
import { formatMixTime, mixDuration, mixTimeline, type MixProject } from '../../services/mix/mixTimeline';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useConnectivityStore } from '../../stores/useConnectivityStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { log } from '../../utils/appLogger';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import { exportMixJson } from '../../services/mix/mixJsonTransfer';

export function MixDetail({ mixId }: { mixId: string }) {
  const router = useRouter();
  const [project, setProject] = React.useState<MixProject | null>(null);
  const [library, setLibrary] = React.useState<LibraryTrack[]>([]);
  const [error, setError] = React.useState('');
  const [editor, setEditor] = React.useState(false);
  const [picker, setPicker] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const pending = React.useRef(false);
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
      setProject(mix); setLibrary(tracks); setError(mix ? '' : 'Mix não encontrado.');
    } catch (reason) { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o mix.'); }
  }, [mixId]);
  useFocusEffect(React.useCallback(() => { focused.current = true; void load(); return () => { focused.current = false; generation.current++; }; }, [load]));
  React.useEffect(() => { void load(); }, [revision, load]);
  React.useEffect(() => {
    if (!project || sourceRequest.current) return;
    sourceRequest.current = true;
    void downloadMixSources(project, library).catch((reason) => log.error('mix source download failed', { mixId, error: reason }))
      .finally(() => { sourceRequest.current = false; });
  }, [project, library, connectivity, mixId]);
  const refresh = () => useLibraryStore.getState().refreshLibrary();
  const add = async (ids: string[]) => {
    try {
      const byId = new Map(library.map((track) => [track.spotifyId, track]));
      const selected = ids.map((id) => byId.get(id)).filter((track): track is LibraryTrack => Boolean(track));
      const saved = await addTracksToMix(mixId, selected);
      setProject(saved); refresh();
      void downloadMixSources(saved, library).catch((reason) => log.error('mix download queue failed', { mixId, error: reason }));
    } catch (reason) { Alert.alert('Mix', reason instanceof Error ? reason.message : 'Não foi possível adicionar as músicas.'); }
  };
  const play = async (trackId?: string) => {
    if (!project || pending.current) return;
    pending.current = true; setPreparing(true);
    const expectedRevision = project.revision;
    try {
      await downloadMixSources(project);
      const output = await renderMixAudio(project);
      if (!focused.current || projectRef.current?.revision !== expectedRevision) return;
      const byId = new Map(library.map((track) => [track.spotifyId, track]));
      const cover = project.tracks.find((track) => track.spotifyId === project.clips[0]?.trackId);
      const player = usePlayerStore.getState();
      await player.playWithQueue([{
        spotifyId: `${mixId}_render_${project.revision}`, title: project.title,
        artistName: [...new Set(project.tracks.map((track) => track.artistName))].join(' · '), albumName: 'Mix',
        imageURL: (cover && (byId.get(cover.spotifyId)?.localImagePath || byId.get(cover.spotifyId)?.imageURL || cover.imageURL)) || '',
        explicit: project.tracks.some((track) => (byId.get(track.spotifyId)?.explicit ?? track.explicit) === true),
        localAudioPath: output.uri, localOnly: true, duration_ms: output.durationMs,
      }], 0, `playlist:${mixId}:revision:${project.revision}`);
      const offset = trackId ? mixTimeline(project.clips).find((clip) => clip.trackId === trackId)?.startMs : 0;
      if (offset) await usePlayerStore.getState().seekToPosition(offset);
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
  const pickerModal = <PlaylistTrackPickerModal visible={picker} tracks={library} existingTrackIds={sourceIds}
    onClose={() => setPicker(false)} onConfirm={(ids) => void add(ids)} />;
  return <>
    <CollectionDetail kind="playlist" collectionId={mixId} title={project.title} description={project.description}
      playbackSourceId={`playlist:${mixId}:revision:${project.revision}`}
      imageURL={covers[0] || ''} imageURLs={covers}
      metadata={`Mix · ${project.clips.length} clipes · ${formatMixTime(mixDuration(project.clips))}`}
      trackCount={tracks.length} totalDurationMs={mixDuration(project.clips)} tracks={tracks} disableTrackArtistLinks
      onPlayMix={play} onOpenMixEditor={() => setEditor(true)} onEditPress={() => setEditor(true)}
      onShareMix={async () => {
        await Clipboard.setStringAsync(await exportMixJson({ ...project, tracks: sources }));
        Alert.alert('Mix copiado', 'Músicas, cortes, ordem e volumes copiados. Importe o JSON nas Configurações.');
      }}
      onAddTracksPress={() => setPicker(true)} onRefresh={load} loadingError={error}
      onRemoveTrack={(trackId) => {
        void saveMixProject(project, project.clips.filter((clip) => clip.trackId !== trackId))
          .then((saved) => { setProject(saved); refresh(); })
          .catch((reason) => Alert.alert('Mix', String(reason)));
      }}
      onDeletePress={() => Alert.alert('Excluir mix?', 'As músicas baixadas continuarão na biblioteca.', [
        { text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => {
          void deleteMixProject(mixId).then(() => { refresh(); router.replace('/(tabs)/library'); })
            .catch(() => Alert.alert('Mix', 'Não foi possível excluir o mix.'));
        } },
      ])}
      footer={preparing ? <View style={S.status}><Text style={S.text}>Preparando mix…</Text></View> : undefined} />
    {editor ? <MixEditorModal visible project={project} library={library} onClose={() => { setEditor(false); setPicker(false); }}
      onSaved={(mix) => { setProject(mix); refresh(); }} onAddTracks={() => setPicker(true)} nested={pickerModal} /> : pickerModal}
  </>;
}
const S = StyleSheet.create({ status: { padding: 20 }, text: { color: '#ABABB2', textAlign: 'center' } });
