import * as React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import Scissors from 'lucide-react-native/icons/scissors';
import Trash2 from 'lucide-react-native/icons/trash-2';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Redo2 from 'lucide-react-native/icons/redo-2';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import GripVertical from 'lucide-react-native/icons/grip-vertical';
import Plus from 'lucide-react-native/icons/plus';
import Volume2 from 'lucide-react-native/icons/volume-2';
import { SheetFrame, LoggedPressable } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistForm, PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { TrackRow } from '../common/TrackRow';
import { saveMixProject } from '../../services/mix/mixRepository';
import { clipDuration, formatMixTime, MIN_CLIP_MS, mixDuration, mixTimeline, moveMixClip, splitMixClip, trimMixClip,
  validateMixClips, type MixClip, type MixProject } from '../../services/mix/mixTimeline';
import { log } from '../../utils/appLogger';
import { useMixPreview } from './useMixPreview';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import type { LibraryTrack } from '../../services/library/catalogLibrary';
import { MixTimelineEditor } from './MixTimelineEditor';

function Tool({ label, caption, icon: Icon, onPress, disabled = false, selected = false }: {
  label: string; caption?: string; icon: typeof Play; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[S.tool, disabled && { opacity: 0.3 }]}>
    <Icon size={22} color={selected ? '#1ED760' : '#FFFFFF'} />
    {caption ? <Text style={S.toolCaption}>{caption}</Text> : null}
  </LoggedPressable>;
}

function ClipRow({ clip, track, selected, index, onSelect, onMove }: {
  clip: MixClip; track: ReturnType<typeof mergeMixTrack>; selected: boolean; index: number; onSelect: () => void;
  onMove: (direction: number) => void;
}) {
  const drag = useReorderableDrag();
  return <TrackRow track={{ ...track, duration_ms: clipDuration(clip) }} title={track.title} subtitle={track.artistName}
    imageURL={track.localImagePath || track.imageURL} active={selected} selected={selected} compact playing={false} onPress={onSelect}
    accessibilityLabel={`Selecionar faixa do clipe ${index + 1}: ${track.title}`}
    onDownload={() => {}} downloadState="idle" repairUnavailableOnPress={false} showAvailability={false}
    trailingAction={<Pressable accessibilityRole="adjustable" accessibilityLabel={`Reordenar ${track.title}`}
      accessibilityValue={{ text: `Clipe ${index + 1}` }} accessibilityActions={[
        { name: 'increment', label: 'Mover depois' }, { name: 'decrement', label: 'Mover antes' },
      ]} onAccessibilityAction={({ nativeEvent }) => onMove(nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLongPress={drag} delayLongPress={250} style={S.dragHandle}><GripVertical size={20} color="#A5A5AA" /></Pressable>} />;
}

export function MixEditorModal({ project, library, visible, onClose, onSaved, onAddTracks, nested }: {
  project: MixProject; visible: boolean; onClose: () => void; onSaved: (mix: MixProject) => void;
  onAddTracks: () => void; nested?: React.ReactNode; library?: LibraryTrack[];
}) {
  const [clips, setClips] = React.useState(project.clips);
  const [past, setPast] = React.useState<MixClip[][]>([]);
  const [future, setFuture] = React.useState<MixClip[][]>([]);
  const [selectedId, select] = React.useState(project.clips[0]?.id || '');
  const [title, setTitle] = React.useState(project.title);
  const [description, setDescription] = React.useState(project.description);
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const [panel, setPanel] = React.useState<'volume' | null>(null);
  const [volume, setVolume] = React.useState(1);
  const preview = useMixPreview();
  const timeline = React.useMemo(() => mixTimeline(clips), [clips]);
  const total = React.useMemo(() => mixDuration(clips), [clips]);
  const selected = timeline.find((clip) => clip.id === selectedId);
  const tracks = React.useMemo(() => {
    const byId = new Map((library || []).map((item) => [item.spotifyId, item]));
    return new Map(project.tracks.map((item) => [item.spotifyId, mergeMixTrack(item, byId.get(item.spotifyId))]));
  }, [project.tracks, library]);
  const track = selected ? tracks.get(selected.trackId) : undefined;
  const pan = React.useMemo(() => Gesture.Pan().activateAfterLongPress(300), []);
  const dirty = title !== project.title || description !== project.description || JSON.stringify(clips) !== JSON.stringify(project.clips);

  React.useEffect(() => {
    preview.stop();
    setPanel(null);
    if (!visible) return;
    setClips(project.clips); setPast([]); setFuture([]); select(project.clips[0]?.id || '');
    setTitle(project.title); setDescription(project.description); preview.setPosition(0);
    // A new revision starts a fresh editing session after adding source tracks.
  }, [visible, project.id, project.revision, preview.stop]);
  React.useEffect(() => {
    if (selected) setVolume(selected.volume);
  }, [selected?.id, selected?.sourceStartMs, selected?.sourceEndMs, selected?.volume]);

  const commit = (next: MixClip[], action: string) => {
    if (savingRef.current || next === clips || JSON.stringify(next) === JSON.stringify(clips)) return;
    try { validateMixClips(next, project.tracks); }
    catch (error) { Alert.alert('Mix', String(error)); return; }
    preview.stop(); setPast((items) => [...items.slice(-49), clips]); setFuture([]); setClips(next);
    log.ui('mix edit', { mixId: project.id, action, clips: next.length });
  };
  const close = () => {
    preview.stop();
    if (savingRef.current) return;
    const finish = () => { preview.stop(); onClose(); };
    if (dirty) Alert.alert('Descartar alterações?', 'As edições ainda não foram salvas.', [
      { text: 'Continuar editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: finish },
    ]); else finish();
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); preview.stop();
    try { const saved = await saveMixProject(project, clips, title, description); onSaved(saved); onClose(); }
    catch (error) { Alert.alert('Mix', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const pick = (clip: (typeof timeline)[number]) => {
    preview.stop(); select(clip.id);
    if (preview.position < clip.startMs || preview.position >= clip.endMs) preview.setPosition(clip.startMs);
  };
  const undo = () => {
    if (!past.length || saving) return;
    preview.stop(); setFuture([clips, ...future]); setClips(past[past.length - 1]); setPast(past.slice(0, -1));
  };
  const redo = () => {
    if (!future.length || saving) return;
    preview.stop(); setPast([...past, clips]); setClips(future[0]); setFuture(future.slice(1));
  };
  const header = <View style={S.headerContent}>
    <View style={S.transport}>
      <Tool label={preview.playing || preview.busy ? 'Parar prévia' : 'Ouvir mix'} icon={preview.playing ? Pause : Play}
        disabled={!clips.length || saving} onPress={() => preview.playing || preview.busy ? preview.stop()
          : void preview.play({ ...project, clips }, preview.position >= total ? 0 : preview.position)} selected={preview.playing} />
      <View style={S.clockGroup}>
        <Text style={S.clock}>{formatMixTime(Math.min(preview.position, total))}</Text>
        <Text style={S.clockTotal}>{formatMixTime(total)}</Text>
      </View>
      <View style={S.history}>
        <Tool label="Desfazer" icon={Undo2} disabled={!past.length || saving} onPress={undo} />
        <Tool label="Refazer" icon={Redo2} disabled={!future.length || saving} onPress={redo} />
      </View>
    </View>
    {preview.busy ? <Text accessibilityRole="alert" style={S.secondary}>Preparando áudio…</Text> : null}
    {preview.error ? <Text accessibilityRole="alert" style={S.error}>{preview.error}</Text> : null}
    <MixTimelineEditor timeline={timeline} total={total} tracks={tracks} selectedId={selectedId} position={preview.position}
      playing={preview.playing} disabled={saving} onSelect={pick} onSeek={preview.setPosition} onScrub={preview.stop}
      onTrim={(id, range) => commit(trimMixClip(clips, id, range[0], range[1]), 'trim-handle')} />
    {selected && track ? <View style={S.inspector}>
      <Text style={S.heading} numberOfLines={1}>{track.title}</Text>
      <Text style={S.secondary} numberOfLines={1}>{track.artistName} • {formatMixTime(clipDuration(selected))}</Text>
      <Text style={S.secondary}>{(selected.sourceStartMs / 1000).toFixed(2)} s – {(selected.sourceEndMs / 1000).toFixed(2)} s</Text>
      <View style={S.editTools}>
        <Tool label="Dividir no cursor" caption="Dividir" icon={Scissors} disabled={saving || preview.position - selected.startMs < MIN_CLIP_MS || selected.endMs - preview.position < MIN_CLIP_MS}
          onPress={() => commit(splitMixClip(clips, selected.id, preview.position), 'split')} />
        <Tool label="Volume do clipe" caption="Volume" icon={Volume2} disabled={saving} onPress={() => { preview.stop(); setVolume(selected.volume); setPanel('volume'); }} />
        <Tool label="Remover clipe" caption="Excluir" icon={Trash2} disabled={saving} onPress={() => { commit(clips.filter((clip) => clip.id !== selected.id), 'remove'); select(''); }} />
      </View>
    </View> : null}
    <View style={S.sectionHeader}><Text style={S.heading}>Clipes · {clips.length}</Text>
      <Tool label="Adicionar músicas ao mix" icon={Plus} disabled={saving} onPress={() => {
        preview.stop();
        if (dirty) Alert.alert('Salve as edições', 'Salve o mix antes de adicionar novas músicas.'); else onAddTracks();
      }} /></View>
  </View>;

  return <SheetFrame visible={visible} title="Editar mix" onClose={close} onDismiss={preview.stop} scroll={false} size="full"
    persistentHeaderGlass allowSwipeDismissal={!dirty && !saving} hideDefaultClose
    headerLeading={<HeaderIconButton icon="x" label="Fechar" onPress={close} />}
    nested={<>{nested}{panel === 'volume' && selected ? <SheetFrame visible title="Volume" size="sheet"
      onClose={() => setPanel(null)} hideDefaultClose headerLeading={<HeaderIconButton icon="x" label="Cancelar volume" onPress={() => setPanel(null)} />}
      headerTrailing={<PlaylistSheetAction label="Aplicar volume" onPress={() => {
        commit(clips.map((clip) => clip.id === selected.id ? { ...clip, volume } : clip), 'volume'); setPanel(null);
      }} />}>
      <View style={S.rangeLabel}><Text style={S.secondary}>Volume do clipe</Text><Text style={S.value}>{Math.round(volume * 100)}%</Text></View>
      <Slider accessibilityLabel="Ajustar volume do clipe" value={volume} minimumValue={0} maximumValue={1} step={0.01}
        minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" onValueChange={setVolume} />
    </SheetFrame> : null}</>}
    headerTrailing={<PlaylistSheetAction label="Salvar mix" disabled={!title.trim() || !dirty} busy={saving} onPress={() => void save()} />}
    renderScrollContent={(pageProps) => <ReorderableList {...pageProps} testID="mix-editor-clips" data={clips} panGesture={pan}
      dragEnabled={!saving} keyExtractor={(clip) => clip.id} contentContainerStyle={[pageProps.contentContainerStyle, { gap: 0 }]}
      ListHeaderComponent={header} onReorder={({ from, to }) => commit(moveMixClip(clips, from, to), 'reorder')}
      renderItem={({ item, index }) => <ClipRow clip={item} track={tracks.get(item.trackId)!} index={index} selected={item.id === selectedId}
        onSelect={() => pick(timeline[index])} onMove={(direction) => commit(moveMixClip(clips, index, index + direction), 'reorder')} />}
      ListEmptyComponent={<Text style={S.empty}>Nenhum clipe no mix.</Text>}
      ListFooterComponent={<View style={{ marginTop: 16 }}><PlaylistForm kind="mix" title={title} description={description}
        onTitleChange={setTitle} onDescriptionChange={setDescription} disabled={saving} /></View>} />}><View /></SheetFrame>;
}

const S = StyleSheet.create({
  headerContent: { gap: 8 }, transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  tool: { minWidth: 40, minHeight: 40, gap: 3, alignItems: 'center', justifyContent: 'center' },
  dragHandle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  toolCaption: { fontSize: 11, color: '#ABABB2', fontFamily: 'SF-Regular' },
  clockGroup: { position: 'absolute', left: '35%', right: '35%', alignItems: 'center' },
  history: { flexDirection: 'row', gap: 4 },
  clock: { color: '#FFFFFF', fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'center' },
  clockTotal: { color: '#ABABB2', fontSize: 12, fontVariant: ['tabular-nums'] },
  inspector: { paddingTop: 4, gap: 3 },
  rangeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  secondary: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Regular' },
  value: { color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  heading: { color: '#FFFFFF', fontSize: 16, fontFamily: 'SF-Semibold', flexShrink: 1 },
  editTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { color: '#ABABB2', paddingVertical: 24, textAlign: 'center' }, error: { color: '#FF9F9F', fontSize: 13 },
});
