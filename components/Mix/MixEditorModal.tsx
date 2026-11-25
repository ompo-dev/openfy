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
import TagPlus from 'lucide-react-native/icons/tag-plus';
import CopyCheck from 'lucide-react-native/icons/copy-check';
import Copy from 'lucide-react-native/icons/copy';
import ClipboardPaste from 'lucide-react-native/icons/clipboard-paste';
import CopyPlus from 'lucide-react-native/icons/copy-plus';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import MoveHorizontal from 'lucide-react-native/icons/move-horizontal';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import { SheetFrame, LoggedPressable } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { PlaylistTrackPickerModal } from '../LocalPlaylist/PlaylistTrackPickerModal';
import { saveMixProject } from '../../services/mix/mixRepository';
import { compactMixLanes, createMixId, MIN_CLIP_MS, clipDuration, formatMixTime, insertMixClipCopy, mixDuration, mixTimeline, moveMixClip, placeMixClip, replaceMixClipSource, slipMixClip, splitMixClip, trimMixClipAtPosition,
  validateMixClips, type MixClip, type MixProject } from '../../services/mix/mixTimeline';
import { log } from '../../utils/appLogger';
import { useMixPreview } from './useMixPreview';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import type { LibraryTrack } from '../../services/library/catalogLibrary';
import { MixTimelineEditor } from './MixTimelineEditor';
import { MixBeatSheet } from './MixBeatSheet';
import { getExistingLocalAudioPath } from '../../services/download/localAudioPaths';

function Tool({ label, caption, icon: Icon, onPress, disabled = false, selected = false, transport = false, filled = false }: {
  label: string; caption?: string; icon: typeof Play; onPress: () => void; disabled?: boolean; selected?: boolean; transport?: boolean; filled?: boolean;
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[S.tool, transport && S.transportTool, disabled && { opacity: 0.42 }]}>
    <Icon size={transport ? 24 : 22} color={disabled && transport ? '#8994A3' : selected && !transport ? '#1ED760' : '#FFFFFF'}
      fill={filled ? '#FFFFFF' : 'none'} />
    {caption ? <Text style={S.toolCaption}>{caption}</Text> : null}
  </LoggedPressable>;
}

export type MixEditorHandle = { close: () => void; stop: () => void; hasPendingEdits: () => boolean };

export function MixEditor({ project, library, onClose, onSaved, editorRef, onGestureActive, onPreviewStart }: {
  project: MixProject; onClose: () => void; onSaved: (mix: MixProject) => void;
  library?: LibraryTrack[]; editorRef?: React.Ref<MixEditorHandle>;
  onGestureActive?: (active: boolean) => void; onPreviewStart?: () => void;
}) {
  const [clips, setClips] = React.useState(() => compactMixLanes(project.clips));
  const [past, setPast] = React.useState<MixClip[][]>([]);
  const [future, setFuture] = React.useState<MixClip[][]>([]);
  const [selectedId, select] = React.useState(project.clips[0]?.id || '');
  const [sources, setSources] = React.useState(project.tracks);
  const [pickerLane, setPickerLane] = React.useState<number | null>(null);
  const [replaceId, setReplaceId] = React.useState<string | null>(null);
  const [clipboard, setClipboard] = React.useState<MixClip | null>(null);
  const [slip, setSlip] = React.useState<{ id: string; sourceStart: number } | null>(null);
  const session = React.useRef(0);
  const editVersion = React.useRef(0);
  const savedRevision = React.useRef<{ id: string; revision: number } | null>(null);
  const [saving, setSaving] = React.useState(false);
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
    if (savedRevision.current?.id === project.id && savedRevision.current.revision === project.revision) {
      savedRevision.current = null;
      return;
    }
    preview.stop();
    setPanel(null);
    session.current++;
    setSlip(null); setReplaceId(null); setClipboard(null);
    setClips(compactMixLanes(project.clips)); setPast([]); setFuture([]); select(project.clips[0]?.id || '');
    setSources(project.tracks); setPickerLane(null); preview.setPosition(0);
    // A new revision starts a fresh editing session after adding source tracks.
  }, [project.id, project.revision, preview.stop]);
  React.useEffect(() => () => { session.current++; }, []);
  React.useEffect(() => {
    if (selected) setVolume(selected.volume);
  }, [selected?.id, selected?.sourceStartMs, selected?.sourceEndMs, selected?.volume]);

  const commit = (next: MixClip[], action: string, nextSources = sources) => {
    next = compactMixLanes(next);
    if (savingRef.current || next === clips || JSON.stringify(next) === JSON.stringify(clips)) return false;
    try { validateMixClips(next, nextSources); }
    catch (error) { Alert.alert('Mix', String(error)); return false; }
    editVersion.current++;
    preview.stop(); setPast((items) => [...items.slice(-49), clips]); setFuture([]); setClips(next);
    setSources(nextSources);
    log.ui('mix edit', { mixId: project.id, action, clips: next.length });
    return true;
  };
  const close = () => {
    preview.stop();
    if (slip) { setSlip(null); onGestureActive?.(false); return; }
    if (savingRef.current) return;
    const finish = () => { session.current++; preview.stop(); onClose(); };
    if (dirty) Alert.alert('Descartar alterações?', 'As edições ainda não foram salvas.', [
      { text: 'Continuar editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: finish },
    ]); else finish();
  };
  React.useImperativeHandle(editorRef, () => ({
    close, stop: preview.stop, hasPendingEdits: () => dirty || savingRef.current || !!slip,
  }));
  React.useEffect(() => () => onGestureActive?.(false), [onGestureActive]);
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); preview.stop();
    try {
      const saved = await saveMixProject({ ...project, tracks: sources }, clips);
      savedRevision.current = { id: saved.id, revision: saved.revision };
      onSaved(saved);
    }
    catch (error) { Alert.alert('Mix', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const pick = (clip: (typeof timeline)[number]) => {
    preview.stop(); select(clip.id);
    if (preview.position < clip.startMs || preview.position >= clip.endMs) preview.setPosition(clip.startMs);
  };
  const undo = () => {
    if (!past.length || saving) return;
    editVersion.current++;
    preview.stop(); setFuture([clips, ...future]); setClips(past[past.length - 1]); setPast(past.slice(0, -1));
  };
  const redo = () => {
    if (!future.length || saving) return;
    editVersion.current++;
    preview.stop(); setPast([...past, clips]); setClips(future[0]); setFuture(future.slice(1));
  };
  const addSources = async (ids: string[]) => {
    if (pickerLane === null) return;
    const request = session.current;
    const version = editVersion.current;
    const available = new Map(downloaded.map((item) => [item.spotifyId, item]));
    const additions = ids.map((id) => available.get(id)).filter((item): item is LibraryTrack => Boolean(item));
    const merged = new Map(sources.map((item) => [item.spotifyId, item]));
    for (const item of additions) if (!merged.has(item.spotifyId)) merged.set(item.spotifyId, item);
    const nextSources = [...merged.values()];
    const added = additions.map((item) => ({ id: createMixId(), trackId: item.spotifyId,
      sourceStartMs: 0, sourceEndMs: Math.floor(item.duration_ms), volume: 1, lane: pickerLane }));
    if (!added.length) return;
    const files = await Promise.all(additions.map((item) => getExistingLocalAudioPath(item.localAudioPath, 0)));
    if (request !== session.current) return;
    if (version !== editVersion.current) { Alert.alert('Mix', 'O mix mudou. Selecione as músicas novamente.'); return; }
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
  const replaceSource = async (ids: string[]) => {
    const id = replaceId;
    const request = session.current;
    const version = editVersion.current;
    const item = downloaded.find((track) => track.spotifyId === ids[0]);
    if (!id || !item) return;
    try {
      if (!await getExistingLocalAudioPath(item.localAudioPath, 0)) throw new Error('Baixe a música antes de substituí-la.');
      if (request !== session.current) return;
      if (version !== editVersion.current) { Alert.alert('Mix', 'O mix mudou. Escolha a substituição novamente.'); return; }
      const source = sources.find((track) => track.spotifyId === item.spotifyId) || item;
      const nextSources = sources.includes(source) ? sources : [...sources, source];
      if (commit(replaceMixClipSource(clips, id, source), 'replace-source', nextSources)) select(id);
    } catch (error) { if (request === session.current) Alert.alert('Mix', String(error)); }
  };
  const copyClip = () => {
    const clip = clips.find((item) => item.id === selectedId);
    if (clip) setClipboard({ ...clip, ...(clip.beatsMs ? { beatsMs: [...clip.beatsMs] } : {}) });
  };
  const insertCopy = (duplicate: boolean) => {
    const clip = duplicate ? clips.find((item) => item.id === selectedId) : clipboard;
    if (!clip || (duplicate && !selected)) return;
    const id = createMixId();
    const next = insertMixClipCopy(clips, clip, id, selected?.lane ?? clip.lane ?? 0,
      duplicate ? selected!.endMs : preview.position, duplicate);
    if (next === clips) { Alert.alert('Mix', 'Não há espaço disponível para outro clipe.'); return; }
    if (commit(next, duplicate ? 'duplicate' : 'paste')) select(id);
  };
  const openSlip = () => {
    if (!selected || !track || track.duration_ms <= clipDuration(selected)) return;
    preview.stop();
    setSlip({ id: selected.id, sourceStart: selected.sourceStartMs });
    preview.setPosition(selected.startMs + clipDuration(selected) / 2);
  };
  const cancelSlip = () => { preview.stop(); setSlip(null); onGestureActive?.(false); };
  const applySlip = () => {
    if (slip && track) commit(slipMixClip(clips, slip.id, slip.sourceStart, track.duration_ms), 'slip');
    cancelSlip();
  };
  const playbackClips = slip && track ? slipMixClip(clips, slip.id, slip.sourceStart, track.duration_ms) : clips;
  const cursorClip = selected || timeline.find((clip) => preview.position >= clip.startMs && preview.position < clip.endMs);
  const toggleCursorSelection = () => {
    if (selected) { preview.stop(); select(''); }
    else if (cursorClip) pick(cursorClip);
  };
  const addBeatAtCursor = () => {
    if (!selected || preview.position < selected.startMs || preview.position >= selected.endMs) return;
    const ms = Math.round(selected.sourceStartMs + preview.position - selected.startMs);
    const beatsMs = [...new Set([...(selected.beatsMs || []), ms])].sort((a,b) => a-b);
    commit(clips.map((clip) => clip.id === selected.id ? { ...clip, beatsMs } : clip), 'beat-at-cursor');
  };
  const header = <View style={S.headerContent}>
    <View style={S.transport}>
      <View style={S.transportSide}>
        <Tool transport label="Adicionar batida no cursor" icon={TagPlus} disabled={saving || !!slip || !selected || preview.position < selected.startMs || preview.position >= selected.endMs} onPress={addBeatAtCursor} />
        <Tool transport label="Alternar seleção do clipe" icon={CopyCheck} disabled={saving || !!slip || !cursorClip} onPress={toggleCursorSelection} />
      </View>
      <View style={S.centerTransport}><Tool transport filled label={preview.playing || preview.busy ? 'Parar prévia' : 'Ouvir mix'} icon={preview.playing || preview.busy ? Pause : Play}
        disabled={!clips.length || saving} onPress={() => { if (!preview.playing && !preview.busy) onPreviewStart?.(); void preview.toggle({ ...project, tracks: sources, clips: playbackClips },
          selected ? (preview.position >= selected.startMs && preview.position < selected.endMs ? preview.position : selected.startMs)
            : preview.position >= total ? 0 : preview.position, selected?.id); }} selected={preview.playing} /></View>
      <View style={[S.transportSide, S.history]}>
        <Tool transport label="Desfazer" icon={Undo2} disabled={!past.length || saving || !!slip} onPress={undo} />
        <Tool transport label="Refazer" icon={Redo2} disabled={!future.length || saving || !!slip} onPress={redo} />
      </View>
    </View>
    {preview.error ? <Text accessibilityRole="alert" style={S.error}>{preview.error}</Text> : null}
    <MixTimelineEditor timeline={timeline} total={total} tracks={tracks} selectedId={selectedId} position={preview.position}
      playing={preview.playing} disabled={saving} onSelect={pick} onSeek={preview.setPosition} onScrub={preview.stop}
      onTrim={(id, range) => commit(trimMixClipAtPosition(clips, id, range[0], range[1]), 'trim-handle')}
      onDragSelect={select} onMoveClip={(id, lane, ms) => commit(placeMixClip(clips, id, lane, ms), 'drag-clip')}
      onDeselect={() => { preview.stop(); select(''); }}
      onAddTrack={openPicker} onTrimActive={onGestureActive}
      slip={slip ? { ...slip, onChange: (sourceStart) => { preview.stop(); setSlip((old) => old ? { ...old, sourceStart } : old); } } : undefined} />
    {slip && selected ? <View style={S.slipTools}>
      <Tool label="Cancelar deslizar" icon={X} onPress={cancelSlip} />
      <View style={S.slipText}><Text style={S.secondary}>Arraste para selecionar o trecho do áudio que você quer incluir</Text>
        <Text style={S.slipRange}>{formatMixTime(slip.sourceStart)} – {formatMixTime(slip.sourceStart + clipDuration(selected))} · {formatMixTime(clipDuration(selected))}</Text></View>
      <Tool label="Aplicar deslizar" icon={Check} onPress={applySlip} />
    </View> : selected && track ? <View style={S.inspector}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.editTools}>
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
        <Tool label="Substituir clipe" caption="Substituir" icon={ArrowLeftRight} disabled={saving} onPress={() => { preview.stop(); setReplaceId(selected.id); }} />
        <Tool label="Copiar clipe" caption="Copiar" icon={Copy} disabled={saving} onPress={copyClip} />
        <Tool label="Colar clipe" caption="Colar" icon={ClipboardPaste} disabled={saving || !clipboard} onPress={() => insertCopy(false)} />
        <Tool label="Duplicar clipe" caption="Duplicar" icon={CopyPlus} disabled={saving} onPress={() => insertCopy(true)} />
        <Tool label="Deslizar clipe" caption="Deslizar" icon={MoveHorizontal} disabled={saving || track.duration_ms <= clipDuration(selected)} onPress={openSlip} />
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
      </ScrollView>
    </View> : clipboard ? <View style={S.inspector}><Tool label="Colar clipe" caption="Colar" icon={ClipboardPaste} disabled={saving} onPress={() => insertCopy(false)} /></View> : null}
  </View>;

  return <View testID="mix-inline-editor" style={S.inline}>
    {header}
    <View style={S.inlineActions}>
      <HeaderIconButton icon="x" label="Fechar editor" disabled={saving} onPress={close} />
      <PlaylistSheetAction label="Salvar mix" disabled={!dirty || !!slip} busy={saving} onPress={() => void save()} />
    </View>
    {pickerLane !== null ? <PlaylistTrackPickerModal visible tracks={downloaded} existingTrackIds={[]}
      onClose={() => setPickerLane(null)} onConfirm={(ids) => void addSources(ids)} /> : null}{replaceId !== null ? <PlaylistTrackPickerModal visible tracks={downloaded}
      existingTrackIds={[]} singleSelection title="Substituir música" actionLabel="Substituir música"
      onClose={() => setReplaceId(null)} onConfirm={(ids) => void replaceSource(ids)} /> : null}{panel === 'volume' && selected ? <SheetFrame visible title="Áudio" size="sheet" dimBackdrop={false} centerTitle
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
      onPlay={() => { if (!preview.playing && !preview.busy) onPreviewStart?.(); void preview.toggle({ ...project, tracks: sources, clips }, preview.position, selected.id); }}
      onClose={() => { preview.stop(); setPanel(null); }}
      onApply={(beatsMs) => { preview.stop(); commit(clips.map((clip) => clip.id === selected.id ? { ...clip, beatsMs } : clip), 'beats'); setPanel(null); }} /> : null}
  </View>;
}

const S = StyleSheet.create({
  inline: { marginHorizontal: 14, marginBottom: 16 },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  headerContent: { gap: 0 }, transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, backgroundColor: '#0D1117', borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 8 },
  tool: { minWidth: 40, minHeight: 40, gap: 3, alignItems: 'center', justifyContent: 'center' },
  toolCaption: { fontSize: 11, color: '#ABABB2', fontFamily: 'SF-Regular' },
  transportTool: { width: 44 },
  transportSide: { flexDirection: 'row', gap: 4, flex: 1 },
  centerTransport: { width: 44, alignItems: 'center' },
  history: { justifyContent: 'flex-end' },
  inspector: { paddingTop: 4, gap: 3 },
  rangeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  secondary: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Regular' },
  value: { color: '#FFFFFF', fontSize: 13, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  audioTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#44474D', gap: 4 },
  audioTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#FFF' },
  tabText: { color: '#ABABB2', fontSize: 13, fontFamily: 'SF-Semibold', textAlign: 'center' },
  editTools: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 8, paddingVertical: 6 },
  slipTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, backgroundColor: '#0D1117' },
  slipText: { flex: 1, alignItems: 'center', paddingHorizontal: 6, gap: 4 },
  slipRange: { color: '#FFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#FF9F9F', fontSize: 13 },
});
