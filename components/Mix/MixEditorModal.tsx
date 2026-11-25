import * as React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Scissors from 'lucide-react-native/icons/scissors';
import Trash2 from 'lucide-react-native/icons/trash-2';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Redo2 from 'lucide-react-native/icons/redo-2';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Volume2 from 'lucide-react-native/icons/volume-2';
import AudioLines from 'lucide-react-native/icons/audio-lines';
import { SheetFrame, LoggedPressable } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { PlaylistTrackPickerModal } from '../LocalPlaylist/PlaylistTrackPickerModal';
import { saveMixProject } from '../../services/mix/mixRepository';
import { compactMixLanes, createMixId, formatMixTime, MIN_CLIP_MS, mixDuration, mixTimeline, moveMixClip, placeMixClip, splitMixClip, trimMixClipAtPosition,
  validateMixClips, type MixClip, type MixProject } from '../../services/mix/mixTimeline';
import { log } from '../../utils/appLogger';
import { useMixPreview } from './useMixPreview';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import type { LibraryTrack } from '../../services/library/catalogLibrary';
import { MixTimelineEditor } from './MixTimelineEditor';
import { MixBeatSheet } from './MixBeatSheet';
import { getExistingLocalAudioPath } from '../../services/download/localAudioPaths';

function Tool({ label, caption, icon: Icon, onPress, disabled = false, selected = false }: {
  label: string; caption?: string; icon: typeof Play; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[S.tool, disabled && { opacity: 0.3 }]}>
    <Icon size={22} color={selected ? '#1ED760' : '#FFFFFF'} />
    {caption ? <Text style={S.toolCaption}>{caption}</Text> : null}
  </LoggedPressable>;
}

export function MixEditorModal({ project, library, visible, onClose, onSaved, nested }: {
  project: MixProject; visible: boolean; onClose: () => void; onSaved: (mix: MixProject) => void;
  onAddTracks: () => void; nested?: React.ReactNode; library?: LibraryTrack[];
}) {
  const [clips, setClips] = React.useState(() => compactMixLanes(project.clips));
  const [past, setPast] = React.useState<MixClip[][]>([]);
  const [future, setFuture] = React.useState<MixClip[][]>([]);
  const [selectedId, select] = React.useState(project.clips[0]?.id || '');
  const [sources, setSources] = React.useState(project.tracks);
  const [pickerLane, setPickerLane] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [trimActive, setTrimActive] = React.useState(false);
  const savingRef = React.useRef(false);
  const [panel, setPanel] = React.useState<'volume' | 'beats' | null>(null);
  const [audioTab, setAudioTab] = React.useState<'volume' | 'duck' | 'fade'>('volume');
  const [volume, setVolume] = React.useState(1);
  const [duckAmount, setDuckAmount] = React.useState(0);
  const [fadeInMs, setFadeInMs] = React.useState(0);
  const [fadeOutMs, setFadeOutMs] = React.useState(0);
  const preview = useMixPreview();
  const timeline = React.useMemo(() => mixTimeline(clips), [clips]);
  const total = React.useMemo(() => mixDuration(clips), [clips]);
  const selected = timeline.find((clip) => clip.id === selectedId);
  const tracks = React.useMemo(() => {
    const byId = new Map((library || []).map((item) => [item.spotifyId, item]));
    return new Map(sources.map((item) => [item.spotifyId, mergeMixTrack(item, byId.get(item.spotifyId))]));
  }, [sources, library]);
  const track = selected ? tracks.get(selected.trackId) : undefined;
  const downloaded = React.useMemo(() => (library || []).filter((item) => item.isDownloaded && item.localAudioPath), [library]);
  const dirty = JSON.stringify(clips) !== JSON.stringify(project.clips);

  React.useEffect(() => {
    preview.stop();
    setPanel(null);
    if (!visible) return;
    setClips(compactMixLanes(project.clips)); setPast([]); setFuture([]); select(project.clips[0]?.id || '');
    setSources(project.tracks); setPickerLane(null); preview.setPosition(0);
    // A new revision starts a fresh editing session after adding source tracks.
  }, [visible, project.id, project.revision, preview.stop]);
  React.useEffect(() => {
    if (selected) setVolume(selected.volume);
  }, [selected?.id, selected?.sourceStartMs, selected?.sourceEndMs, selected?.volume]);

  const commit = (next: MixClip[], action: string, nextSources = sources) => {
    next = compactMixLanes(next);
    if (savingRef.current || next === clips || JSON.stringify(next) === JSON.stringify(clips)) return;
    try { validateMixClips(next, nextSources); }
    catch (error) { Alert.alert('Mix', String(error)); return; }
    preview.stop(); setPast((items) => [...items.slice(-49), clips]); setFuture([]); setClips(next);
    setSources(nextSources);
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
    try { const saved = await saveMixProject({ ...project, tracks: sources }, clips); onSaved(saved); onClose(); }
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
  const addSources = async (ids: string[]) => {
    if (pickerLane === null) return;
    const available = new Map(downloaded.map((item) => [item.spotifyId, item]));
    const additions = ids.map((id) => available.get(id)).filter((item): item is LibraryTrack => Boolean(item));
    const merged = new Map(sources.map((item) => [item.spotifyId, item]));
    for (const item of additions) if (!merged.has(item.spotifyId)) merged.set(item.spotifyId, item);
    const nextSources = [...merged.values()];
    const added = additions.map((item) => ({ id: createMixId(), trackId: item.spotifyId,
      sourceStartMs: 0, sourceEndMs: Math.floor(item.duration_ms), volume: 1, lane: pickerLane }));
    if (!added.length) return;
    const files = await Promise.all(additions.map((item) => getExistingLocalAudioPath(item.localAudioPath, 0)));
    if (files.some((path) => !path)) {
      Alert.alert('Mix', 'Baixe as músicas antes de adicioná-las ao mix.'); return;
    }
    const next = [...clips, ...added];
    try { validateMixClips(next, nextSources); }
    catch (error) { Alert.alert('Mix', String(error)); return; }
    commit(next, 'add-tracks', nextSources);
    select(added[0].id);
  };
  const openPicker = (lane: number) => { preview.stop(); setPickerLane(lane); };
  const header = <View style={S.headerContent}>
    <View style={S.transport}>
      <Tool label={preview.playing || preview.busy ? 'Parar prévia' : 'Ouvir mix'} icon={preview.playing ? Pause : Play}
        disabled={!clips.length || saving} onPress={() => void preview.toggle({ ...project, tracks: sources, clips },
          selected ? (preview.position >= selected.startMs && preview.position < selected.endMs ? preview.position : selected.startMs)
            : preview.position >= total ? 0 : preview.position, selected?.id)} selected={preview.playing} />
      <View style={S.clockGroup}>
        <Text style={S.clock}>{formatMixTime(preview.position)}</Text>
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
      onTrim={(id, range) => commit(trimMixClipAtPosition(clips, id, range[0], range[1]), 'trim-handle')}
      onDragSelect={select} onMoveClip={(id, lane, ms) => commit(placeMixClip(clips, id, lane, ms), 'drag-clip')}
      onDeselect={() => { preview.stop(); select(''); }}
      onAddTrack={openPicker} onTrimActive={setTrimActive} />
    {selected && track ? <View style={S.inspector}>
      <View style={S.editTools}>
        <Tool label="Dividir no cursor" caption="Dividir" icon={Scissors} disabled={saving || preview.position - selected.startMs < MIN_CLIP_MS || selected.endMs - preview.position < MIN_CLIP_MS}
          onPress={() => commit(splitMixClip(clips, selected.id, preview.position), 'split')} />
        <Tool label="Volume do clipe" caption="Volume" icon={Volume2} disabled={saving} onPress={() => {
          preview.stop(); setVolume(selected.volume); setDuckAmount(selected.duckAmount || 0);
          setFadeInMs(selected.fadeInMs || 0); setFadeOutMs(selected.fadeOutMs || 0);
          setAudioTab('volume'); setPanel('volume');
        }} />
        <Tool label="Batidas do clipe" caption="Batidas" icon={AudioLines} disabled={saving} onPress={() => {
          preview.stop(); if (preview.position < selected.startMs || preview.position >= selected.endMs) preview.setPosition(selected.startMs);
          setPanel('beats');
        }} />
        <Tool label="Remover clipe" caption="Excluir" icon={Trash2} disabled={saving} onPress={() => { commit(clips.filter((clip) => clip.id !== selected.id), 'remove'); select(''); }} />
        <Tool label="Mover clipe antes" icon={ChevronLeft} disabled={saving || !timeline.some((c) => c.lane === selected.lane && c.startMs < selected.startMs)}
          onPress={() => {
            const index = timeline.findIndex((c) => c.id === selected.id);
            const previous = timeline.slice(0, index).map((c) => c.lane).lastIndexOf(selected.lane);
            if (previous >= 0) commit(moveMixClip(clips, index, previous), 'reorder');
          }} />
        <Tool label="Mover clipe depois" icon={ChevronRight} disabled={saving || !timeline.some((c) => c.lane === selected.lane && c.startMs > selected.startMs)}
          onPress={() => {
            const index = timeline.findIndex((c) => c.id === selected.id);
            const next = timeline.findIndex((c, i) => i > index && c.lane === selected.lane);
            if (next >= 0) commit(moveMixClip(clips, index, next), 'reorder');
          }} />
      </View>
    </View> : null}
  </View>;

  return <SheetFrame visible={visible} title="Editar mix" onClose={close} onDismiss={preview.stop} size="full"
    allowSwipeDismissal={!dirty && !saving} hideDefaultClose
    headerLeading={<HeaderIconButton icon="x" label="Fechar" onPress={close} />}
    nested={<>{nested}{pickerLane !== null ? <PlaylistTrackPickerModal visible tracks={downloaded} existingTrackIds={[]}
      onClose={() => setPickerLane(null)} onConfirm={(ids) => void addSources(ids)} /> : null}{panel === 'volume' && selected ? <SheetFrame visible title="Áudio" size="sheet" dimBackdrop={false} centerTitle
      onClose={() => setPanel(null)} hideDefaultClose headerLeading={<HeaderIconButton icon="x" label="Cancelar volume" onPress={() => setPanel(null)} />}
      headerTrailing={<PlaylistSheetAction label="Aplicar volume" onPress={() => {
        commit(clips.map((clip) => clip.id === selected.id ? { ...clip, volume, duckAmount, fadeInMs, fadeOutMs } : clip), 'audio-effects'); setPanel(null);
      }} />}>
      <View style={S.audioTabs}>
        {([['volume', 'Volume'], ['duck', 'Redução automática'], ['fade', 'Esmaecer']] as const).map(([tab, label]) =>
          <LoggedPressable key={tab} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: audioTab === tab }}
            onPress={() => setAudioTab(tab)} style={[S.audioTab, audioTab === tab && S.activeTab]}>
            <Text style={[S.tabText, audioTab === tab && { color: '#FFF' }]}>{label}</Text>
          </LoggedPressable>)}
      </View>
      {audioTab === 'volume' ? <>
      <View style={S.rangeLabel}><Text style={S.secondary}>Volume do clipe</Text><Text style={S.value}>{Math.round(volume * 100)}%</Text></View>
      <Slider accessibilityLabel="Ajustar volume do clipe" value={volume} minimumValue={0} maximumValue={1} step={0.01}
        minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" onValueChange={setVolume} />
      </> : audioTab === 'duck' ? <>
        <View style={S.rangeLabel}><Text style={S.secondary}>Reduzir volume na sobreposição</Text><Text style={S.value}>{Math.round(duckAmount * 100)}%</Text></View>
        <Slider accessibilityLabel="Ajustar redução automática" value={duckAmount} minimumValue={0} maximumValue={1} step={0.01}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={setDuckAmount} />
        <Text style={S.secondary}>Reduz o volume deste clipe quando outra faixa de áudio está tocando.</Text>
      </> : <>
        <View style={S.rangeLabel}><Text style={S.secondary}>Aparecimento gradual</Text><Text style={S.value}>{(fadeInMs / 1000).toFixed(1)} s</Text></View>
        <Slider accessibilityLabel="Ajustar aparecimento gradual" value={fadeInMs} minimumValue={0} maximumValue={Math.max(0, Math.min(30000, selected.endMs - selected.startMs - fadeOutMs))} step={100}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={setFadeInMs} />
        <View style={S.rangeLabel}><Text style={S.secondary}>Desaparecimento gradual</Text><Text style={S.value}>{(fadeOutMs / 1000).toFixed(1)} s</Text></View>
        <Slider accessibilityLabel="Ajustar desaparecimento gradual" value={fadeOutMs} minimumValue={0} maximumValue={Math.max(0, Math.min(30000, selected.endMs - selected.startMs - fadeInMs))} step={100}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={setFadeOutMs} />
      </>}
    </SheetFrame> : null}{panel === 'beats' && selected && track ? <MixBeatSheet clip={selected} duration={track.duration_ms}
      uri={track.localAudioPath} position={preview.position} playing={preview.playing || preview.busy}
      onSeek={(ms) => { preview.stop(); preview.setPosition(ms); }}
      onPlay={() => void preview.toggle({ ...project, tracks: sources, clips }, preview.position, selected.id)}
      onClose={() => { preview.stop(); setPanel(null); }}
      onApply={(beatsMs) => { preview.stop(); commit(clips.map((clip) => clip.id === selected.id ? { ...clip, beatsMs } : clip), 'beats'); setPanel(null); }} /> : null}</>}
    headerTrailing={<PlaylistSheetAction label="Salvar mix" disabled={!dirty} busy={saving} onPress={() => void save()} />}
    renderScrollContent={(pageProps) => <ScrollView {...pageProps} testID="mix-editor-scroll" scrollEnabled={!trimActive}
      showsVerticalScrollIndicator={false}>{header}</ScrollView>}>
    <View />
  </SheetFrame>;
}

const S = StyleSheet.create({
  headerContent: { gap: 8 }, transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  tool: { minWidth: 40, minHeight: 40, gap: 3, alignItems: 'center', justifyContent: 'center' },
  toolCaption: { fontSize: 11, color: '#ABABB2', fontFamily: 'SF-Regular' },
  clockGroup: { position: 'absolute', left: '35%', right: '35%', alignItems: 'center' },
  history: { flexDirection: 'row', gap: 4 },
  clock: { color: '#FFFFFF', fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'center' },
  clockTotal: { color: '#ABABB2', fontSize: 12, fontVariant: ['tabular-nums'] },
  inspector: { paddingTop: 4, gap: 3 },
  rangeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  secondary: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Regular' },
  value: { color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  audioTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#44474D', gap: 4 },
  audioTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#FFF' },
  tabText: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Semibold', textAlign: 'center' },
  editTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 },
  error: { color: '#FF9F9F', fontSize: 13 },
});
