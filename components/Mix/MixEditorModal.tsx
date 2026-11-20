import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import Scissors from 'lucide-react-native/icons/scissors';
import Trash2 from 'lucide-react-native/icons/trash-2';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Redo2 from 'lucide-react-native/icons/redo-2';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import ZoomIn from 'lucide-react-native/icons/zoom-in';
import ZoomOut from 'lucide-react-native/icons/zoom-out';
import GripVertical from 'lucide-react-native/icons/grip-vertical';
import Plus from 'lucide-react-native/icons/plus';
import Volume2 from 'lucide-react-native/icons/volume-2';
import { SheetFrame, LoggedPressable } from '../native';
import { Section, TextField } from '../gym';
import { PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { TrackRow } from '../common/TrackRow';
import { saveMixProject } from '../../services/mix/mixRepository';
import { clipDuration, formatMixTime, MIN_CLIP_MS, mixDuration, mixTimeline, moveMixClip, splitMixClip, trimMixClip,
  validateMixClips, type MixClip, type MixProject } from '../../services/mix/mixTimeline';
import { log } from '../../utils/appLogger';
import { useMixPreview } from './useMixPreview';

const COLORS = ['#CF3276', '#2977B7', '#5D56C7', '#21866B', '#B87928'];

function Tool({ label, icon: Icon, onPress, disabled = false, selected = false }: {
  label: string; icon: typeof Play; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[S.tool, disabled && { opacity: 0.3 }]}>
    <Icon size={22} color={selected ? '#1ED760' : '#FFFFFF'} />
  </LoggedPressable>;
}

function ClipRow({ clip, track, selected, index, onSelect, onMove }: {
  clip: MixClip; track: MixProject['tracks'][number]; selected: boolean; index: number; onSelect: () => void;
  onMove: (direction: number) => void;
}) {
  const drag = useReorderableDrag();
  return <TrackRow title={track.title} subtitle={`${formatMixTime(clip.sourceStartMs)} – ${formatMixTime(clip.sourceEndMs)} · ${track.artistName}`}
    imageURL={track.imageURL} active={selected} playing={false} onPress={onSelect}
    onDownload={() => {}} downloadState="idle" repairUnavailableOnPress={false}
    trailingAction={<Pressable accessibilityRole="adjustable" accessibilityLabel={`Reordenar ${track.title}`}
      accessibilityValue={{ text: `Clipe ${index + 1}` }} accessibilityActions={[
        { name: 'increment', label: 'Mover depois' }, { name: 'decrement', label: 'Mover antes' },
      ]} onAccessibilityAction={({ nativeEvent }) => onMove(nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLongPress={drag} delayLongPress={250} style={S.tool}><GripVertical size={22} color="#A5A5AA" /></Pressable>} />;
}

export function MixEditorModal({ project, visible, onClose, onSaved, onAddTracks, nested }: {
  project: MixProject; visible: boolean; onClose: () => void; onSaved: (mix: MixProject) => void;
  onAddTracks: () => void; nested?: React.ReactNode;
}) {
  const [clips, setClips] = React.useState(project.clips);
  const [past, setPast] = React.useState<MixClip[][]>([]);
  const [future, setFuture] = React.useState<MixClip[][]>([]);
  const [selectedId, select] = React.useState(project.clips[0]?.id || '');
  const [title, setTitle] = React.useState(project.title);
  const [description, setDescription] = React.useState(project.description);
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const [zoom, setZoom] = React.useState(1);
  const [trim, setTrim] = React.useState<[number, number]>([0, 100]);
  const [volume, setVolume] = React.useState(1);
  const preview = useMixPreview();
  const { width } = useWindowDimensions();
  const timeline = mixTimeline(clips);
  const total = mixDuration(clips);
  const selected = timeline.find((clip) => clip.id === selectedId);
  const track = project.tracks.find((item) => item.spotifyId === selected?.trackId);
  const tracks = new Map(project.tracks.map((item) => [item.spotifyId, item]));
  const pan = React.useMemo(() => Gesture.Pan().activateAfterLongPress(300), []);
  const scroll = React.useRef<ScrollView>(null);
  const scale = (width - 64) * zoom / Math.max(total, 60000);
  const timelineWidth = Math.max(width - 64, total * scale);
  const dirty = title !== project.title || description !== project.description || JSON.stringify(clips) !== JSON.stringify(project.clips);

  React.useEffect(() => {
    if (!visible) { preview.stop(); return; }
    setClips(project.clips); setPast([]); setFuture([]); select(project.clips[0]?.id || '');
    setTitle(project.title); setDescription(project.description); preview.setPosition(0);
    // A new revision starts a fresh editing session after adding source tracks.
  }, [visible, project.id, project.revision, preview.stop]);
  React.useEffect(() => {
    if (selected) { setTrim([selected.sourceStartMs, selected.sourceEndMs]); setVolume(selected.volume); }
  }, [selected?.id, selected?.sourceStartMs, selected?.sourceEndMs, selected?.volume]);

  const commit = (next: MixClip[], action: string) => {
    if (savingRef.current || next === clips || JSON.stringify(next) === JSON.stringify(clips)) return;
    try { validateMixClips(next, project.tracks); }
    catch (error) { Alert.alert('Mix', String(error)); return; }
    preview.stop(); setPast((items) => [...items.slice(-49), clips]); setFuture([]); setClips(next);
    log.ui('mix edit', { mixId: project.id, action, clips: next.length });
  };
  const close = () => {
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
  const pick = (clip: (typeof timeline)[number]) => { preview.stop(); select(clip.id); preview.setPosition(clip.startMs); };
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
      <Tool label="Desfazer" icon={Undo2} disabled={!past.length || saving} onPress={undo} />
      <Tool label="Refazer" icon={Redo2} disabled={!future.length || saving} onPress={redo} />
      <Text style={S.clock}>{formatMixTime(preview.position)} / {formatMixTime(total)}</Text>
      <Tool label="Diminuir zoom" icon={ZoomOut} disabled={zoom <= 1} onPress={() => setZoom(Math.max(1, zoom / 2))} />
      <Tool label="Aumentar zoom" icon={ZoomIn} disabled={zoom >= 16} onPress={() => setZoom(Math.min(16, zoom * 2))} />
    </View>
    {preview.busy ? <Text accessibilityRole="alert" style={S.secondary}>Preparando áudio…</Text> : null}
    {preview.error ? <Text accessibilityRole="alert" style={S.error}>{preview.error}</Text> : null}
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={S.timelineScroll}>
      <View accessibilityLabel="Timeline do mix" style={[S.timeline, { width: timelineWidth }]}>
        <View pointerEvents="none" style={S.ruler}>{Array.from({ length: 9 }, (_, index) =>
          <Text key={index} style={[S.tick, { left: `${index * 12.5}%` }]}>{formatMixTime(timelineWidth / scale * index / 8)}</Text>)}</View>
        {timeline.map((clip, index) => <LoggedPressable key={clip.id} onPress={() => pick(clip)}
          accessibilityLabel={`Selecionar clipe ${index + 1}: ${tracks.get(clip.trackId)?.title}`}
          style={[S.clip, { left: clip.startMs * scale, width: Math.max(1, clipDuration(clip) * scale),
            backgroundColor: COLORS[index % COLORS.length], borderColor: clip.id === selectedId ? '#FFFFFF' : 'transparent' }]}>
          {clipDuration(clip) * scale > 80 ? <Image source={{ uri: tracks.get(clip.trackId)?.imageURL }} style={S.clipCover} /> : null}
          <Text numberOfLines={1} style={S.clipTitle}>{tracks.get(clip.trackId)?.title}</Text>
        </LoggedPressable>)}
        <View pointerEvents="none" style={[S.playhead, { left: Math.min(total, preview.position) * scale }]} />
      </View>
    </ScrollView>
    <Slider accessibilityLabel="Posição no mix" value={Math.min(preview.position, total)} minimumValue={0} maximumValue={Math.max(1, total)}
      minimumTrackTintColor="#1ED760" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF"
      onSlidingStart={preview.stop} onValueChange={preview.setPosition} disabled={saving || !clips.length} />
    {selected && track ? <View style={S.inspector}>
      <Text style={S.heading} numberOfLines={1}>{track.title}</Text>
      <View style={S.rangeLabel}><Text style={S.secondary}>Início</Text><Text style={S.value}>{(trim[0] / 1000).toFixed(2)} s</Text></View>
      <Slider accessibilityLabel="Início do recorte" value={trim[0]} minimumValue={0} maximumValue={Math.max(0, trim[1] - MIN_CLIP_MS)} step={10}
        minimumTrackTintColor="#2E9BFF" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" disabled={saving}
        onSlidingStart={preview.stop} onValueChange={(value) => setTrim([value, trim[1]])}
        onSlidingComplete={(value) => commit(trimMixClip(clips, selected.id, value, trim[1]), 'trim-start')} />
      <View style={S.rangeLabel}><Text style={S.secondary}>Fim</Text><Text style={S.value}>{(trim[1] / 1000).toFixed(2)} s</Text></View>
      <Slider accessibilityLabel="Fim do recorte" value={trim[1]} minimumValue={trim[0] + MIN_CLIP_MS} maximumValue={track.duration_ms} step={10}
        minimumTrackTintColor="#2E9BFF" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" disabled={saving}
        onSlidingStart={preview.stop} onValueChange={(value) => setTrim([trim[0], value])}
        onSlidingComplete={(value) => commit(trimMixClip(clips, selected.id, trim[0], value), 'trim-end')} />
      <View style={S.rangeLabel}><Volume2 size={18} color="#E45AC0" /><Text style={S.secondary}>Volume</Text><Text style={S.value}>{Math.round(volume * 100)}%</Text></View>
      <Slider accessibilityLabel="Volume do clipe" value={volume} minimumValue={0} maximumValue={1} step={0.01} disabled={saving}
        minimumTrackTintColor="#E45AC0" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" onSlidingStart={preview.stop}
        onValueChange={setVolume} onSlidingComplete={(value) => commit(clips.map((clip) => clip.id === selected.id ? { ...clip, volume: value } : clip), 'volume')} />
      <View style={S.editTools}>
        <Tool label="Dividir no cursor" icon={Scissors} disabled={saving || preview.position - selected.startMs < MIN_CLIP_MS || selected.endMs - preview.position < MIN_CLIP_MS}
          onPress={() => commit(splitMixClip(clips, selected.id, preview.position), 'split')} />
        <Text style={S.secondary}>{formatMixTime(clipDuration(selected))}</Text>
        <Tool label="Remover clipe" icon={Trash2} disabled={saving} onPress={() => { commit(clips.filter((clip) => clip.id !== selected.id), 'remove'); select(''); }} />
      </View>
    </View> : null}
    <View style={S.sectionHeader}><Text style={S.heading}>Clipes · {clips.length}</Text>
      <Tool label="Adicionar músicas ao mix" icon={Plus} disabled={saving} onPress={() => {
        preview.stop();
        if (dirty) Alert.alert('Salve as edições', 'Salve o mix antes de adicionar novas músicas.'); else onAddTracks();
      }} /></View>
  </View>;

  return <SheetFrame visible={visible} title="Editar mix" onClose={close} scroll={false} nested={nested}
    headerTrailing={<PlaylistSheetAction label="Salvar mix" disabled={!title.trim() || !dirty} busy={saving} onPress={() => void save()} />}
    renderScrollContent={(pageProps) => <ReorderableList {...pageProps} testID="mix-editor-clips" data={clips} panGesture={pan}
      dragEnabled={!saving} keyExtractor={(clip) => clip.id} contentContainerStyle={[pageProps.contentContainerStyle, { gap: 0 }]}
      ListHeaderComponent={header} onReorder={({ from, to }) => commit(moveMixClip(clips, from, to), 'reorder')}
      renderItem={({ item, index }) => <ClipRow clip={item} track={tracks.get(item.trackId)!} index={index} selected={item.id === selectedId}
        onSelect={() => pick(timeline[index])} onMove={(direction) => commit(moveMixClip(clips, index, index + direction), 'reorder')} />}
      ListEmptyComponent={<Text style={S.empty}>Nenhum clipe no mix.</Text>}
      ListFooterComponent={<View style={{ marginTop: 24 }}><Section>
        <TextField label="Nome" accessibilityLabel="Nome do mix" value={title} onChangeText={setTitle} maxLength={80} editable={!saving} />
        <TextField label="Descrição" accessibilityLabel="Descrição do mix" value={description} onChangeText={setDescription} maxLength={240} editable={!saving} />
      </Section></View>} />}><View /></SheetFrame>;
}

const S = StyleSheet.create({
  headerContent: { gap: 12 }, transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  tool: { minWidth: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  clock: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'center' },
  timelineScroll: { height: 140, backgroundColor: '#19191B', borderRadius: 8 }, timeline: { height: 140 },
  ruler: { position: 'absolute', top: 10, left: 0, right: 32 }, tick: { position: 'absolute', fontSize: 10, color: '#A5A5AA' },
  clip: { position: 'absolute', top: 44, height: 74, borderRadius: 6, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  clipCover: { width: 38, height: 38, borderRadius: 4, marginLeft: 6 }, clipTitle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'SF-Semibold', flex: 1, minWidth: 0 },
  playhead: { position: 'absolute', top: 32, bottom: 4, width: 2, backgroundColor: '#FFFFFF' },
  inspector: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#444449', paddingTop: 12, gap: 4 },
  rangeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  secondary: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Regular' },
  value: { color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  heading: { color: '#FFFFFF', fontSize: 16, fontFamily: 'SF-Semibold', flexShrink: 1 },
  editTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { color: '#ABABB2', paddingVertical: 24, textAlign: 'center' }, error: { color: '#FF9F9F', fontSize: 13 },
});
