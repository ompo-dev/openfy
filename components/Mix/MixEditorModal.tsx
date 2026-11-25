import * as React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { HorizontalFadeScrollView } from '../common/HorizontalFadeScrollView';
import { COLORS } from '@config';
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
import { applyMixGroupEffects, insertMixGroupCopy, moveMixGroup, slipMixGroup, trimMixGroup, compactMixLanes, createMixId, MIN_CLIP_MS, clipDuration, formatMixTime, insertMixClipCopy, mixDuration, mixTimeline, moveMixClip, placeMixClip, replaceMixClipSource, slipMixClip, splitMixClip, trimMixClipAtPosition,
  validateMixClips, type MixClip, type MixProject } from '../../services/mix/mixTimeline';
import { log } from '../../utils/appLogger';
import { useMixPreview } from './useMixPreview';
import { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import type { LibraryTrack } from '../../services/library/catalogLibrary';
import { MixTimelineEditor } from './MixTimelineEditor';
import { MixBeatSheet } from './MixBeatSheet';
import { getExistingLocalAudioPath } from '../../services/download/localAudioPaths';

function Tool({ label, caption, icon: Icon, onPress, disabled = false, selected = false, transport = false, filled = false, hasIndicator = false }: {
  label: string; caption?: string; icon: typeof Play; onPress: () => void; disabled?: boolean; selected?: boolean; transport?: boolean; filled?: boolean;
  hasIndicator?: boolean;
}) {
  return <LoggedPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} disabled={disabled} onPress={onPress}
    style={[S.tool, transport && S.transportTool, disabled && { opacity: 0.42 }]}>
    <Icon size={transport ? 24 : 22} color={disabled && transport ? '#8994A3' : selected ? '#FFCF20' : '#FFFFFF'}
      fill={filled ? '#FFFFFF' : 'none'} />
    {caption ? <Text style={S.toolCaption}>{caption}</Text> : null}
    {caption ? <View pointerEvents="none" testID={hasIndicator ? `mix-tool-indicator-${caption}` : undefined} style={[S.toolIndicator, hasIndicator && S.toolIndicatorActive]} /> : null}
  </LoggedPressable>;
}

export type MixEditorHandle = { close: () => void; stop: () => void; hasPendingEdits: () => boolean; flush: () => Promise<boolean> };

export function MixEditor({ project, library, onClose, onSaved, editorRef, onGestureActive, onPreviewStart }: {
  project: MixProject; onClose: () => void; onSaved: (mix: MixProject) => void;
  library?: LibraryTrack[]; editorRef?: React.Ref<MixEditorHandle>;
  onGestureActive?: (active: boolean) => void; onPreviewStart?: () => void;
}) {
  const [clips, setClips] = React.useState(() => compactMixLanes(project.clips));
  const [past, setPast] = React.useState<MixClip[][]>([]);
  const [future, setFuture] = React.useState<MixClip[][]>([]);
  const [selectedId, select] = React.useState(project.clips[0]?.id || '');
  const [multi, setMulti] = React.useState(false);
  const [mutedLanes, setMutedLanes] = React.useState<ReadonlySet<number>>(() => new Set());
  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState(project.tracks);
  const [pickerLane, setPickerLane] = React.useState<number | null>(null);
  const [replaceId, setReplaceId] = React.useState<string[] | null>(null);
  const [clipboard, setClipboard] = React.useState<ReturnType<typeof mixTimeline>>([]);
  const [slip, setSlip] = React.useState<{ id: string; sourceStart: number } | null>(null);
  const session = React.useRef(0);
  const editVersion = React.useRef(0);
  const savedBase = React.useRef(project);
  const writeQueue = React.useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingWrites = React.useRef(0);
  const failedWrite = React.useRef(false);
  const [saveError, setSaveError] = React.useState('');
  const [panel, setPanel] = React.useState<'volume' | 'beats' | null>(null);
  const [audioTab, setAudioTab] = React.useState<'volume' | 'duck' | 'fade'>('volume');
  const [volume, setVolume] = React.useState(1);
  const [duckAmount, setDuckAmount] = React.useState(0);
  const [fadeInMs, setFadeInMs] = React.useState(0);
  const [fadeOutMs, setFadeOutMs] = React.useState(0);
  const effectChanges = React.useRef<Partial<Pick<MixClip, 'volume' | 'duckAmount' | 'fadeInMs' | 'fadeOutMs'>>>({});
  const preview = useMixPreview(mutedLanes);
  const timeline = React.useMemo(() => mixTimeline(clips), [clips]);
  const total = React.useMemo(() => mixDuration(clips), [clips]);
  const selection = timeline.filter((clip) => multi ? groupIds.includes(clip.id) : clip.id === selectedId);
  const selectionIds = new Set(selection.map((clip) => clip.id));
  const selected = selection.find((clip) => clip.id === selectedId) || selection[0];
  const grouped = selection.length > 1;
  const atCursor = selection.filter((clip) => preview.position >= clip.startMs && preview.position < clip.endMs);
  const splittable = selection.filter((clip) => preview.position - clip.startMs >= MIN_CLIP_MS && clip.endMs - preview.position >= MIN_CLIP_MS);
  const tracks = React.useMemo(() => {
    const byId = new Map((library || []).map((item) => [item.spotifyId, item]));
    return new Map(sources.map((item) => [item.spotifyId, mergeMixTrack(item, byId.get(item.spotifyId))]));
  }, [sources, library]);
  const track = selected ? tracks.get(selected.trackId) : undefined;
  const hasAudioMods = selection.some((clip) => clip.volume !== 1 || !!clip.duckAmount || !!clip.fadeInMs || !!clip.fadeOutMs);
  const hasBeatMods = selection.some((clip) => !!clip.beatsMs?.length);
  const hasSourceMods = selection.some((clip) => {
    const source = tracks.get(clip.trackId);
    return !!source && (clip.sourceStartMs > 0 || clip.sourceEndMs < source.duration_ms);
  });
  const toggleLaneMute = (lane: number) => setMutedLanes((previous) => {
    const next = new Set(previous);
    if (next.has(lane)) next.delete(lane); else next.add(lane);
    return next;
  });
  const sourceDuration = (id: string) => tracks.get(id)?.duration_ms ?? NaN;
  const slipChanges = (start: number) => grouped && selected ? slipMixGroup(clips, selectionIds, selected.id, start, sourceDuration)
    : selected && track ? slipMixClip(clips, selected.id, start, track.duration_ms) : clips;
  const downloaded = React.useMemo(() => (library || []).filter((item) => item.isDownloaded && item.localAudioPath), [library]);
  React.useEffect(() => {
    if (savedBase.current.id === project.id && project.revision <= savedBase.current.revision) return;
    if (savedBase.current.id === project.id && (pendingWrites.current || failedWrite.current)) return;
    savedBase.current = project;
    preview.stop();
    setPanel(null);
    session.current++;
    setSlip(null); setReplaceId(null); setClipboard([]); setMulti(false); setGroupIds([]); setMutedLanes(new Set());
    setClips(compactMixLanes(project.clips)); setPast([]); setFuture([]); select(project.clips[0]?.id || '');
    setSources(project.tracks); setPickerLane(null); preview.setPosition(0);
    // A new revision starts a fresh editing session after adding source tracks.
  }, [project.id, project.revision, preview.stop]);
  React.useEffect(() => () => { session.current++; }, []);
  React.useEffect(() => {
    if (selected) setVolume(selected.volume);
  }, [selected?.id, selected?.sourceStartMs, selected?.sourceEndMs, selected?.volume]);

  const persist = (next: MixClip[], nextSources = sources) => {
    pendingWrites.current++;
    const id = project.id;
    const request = session.current;
    writeQueue.current = writeQueue.current.then(async () => {
      try {
        if (savedBase.current.id !== id) throw new Error('O mix mudou.');
        const saved = await saveMixProject({ ...savedBase.current, tracks: nextSources }, next);
        savedBase.current = saved;
        failedWrite.current = false;
        if (session.current === request) setSaveError('');
        onSaved(saved);
        return true;
      } catch (error) {
        failedWrite.current = true;
        const message = error instanceof Error ? error.message : 'Não foi possível salvar.';
        if (session.current === request) setSaveError(message);
        log.error('mix autosave failed', { mixId: id, error });
        return false;
      } finally { pendingWrites.current--; }
    });
    return writeQueue.current;
  };
  const commit = (next: MixClip[], action: string, nextSources = sources) => {
    next = compactMixLanes(next);
    if (next === clips || JSON.stringify(next) === JSON.stringify(clips)) return false;
    try { validateMixClips(next, nextSources); }
    catch (error) { Alert.alert('Mix', String(error)); return false; }
    editVersion.current++;
    preview.stop(); setPast((items) => [...items.slice(-49), clips]); setFuture([]); setClips(next);
    setSources(nextSources);
    void persist(next, nextSources);
    log.ui('mix edit', { mixId: project.id, action, clips: next.length });
    return true;
  };
  const flush = async () => {
    let current: Promise<boolean>;
    do { current = writeQueue.current; await current; } while (current !== writeQueue.current);
    return !failedWrite.current;
  };
  const close = async () => {
    preview.stop();
    if (slip) { setSlip(null); onGestureActive?.(false); return; }
    if (await flush()) { session.current++; onClose(); }
  };
  React.useImperativeHandle(editorRef, () => ({
    close: () => void close(), stop: preview.stop, hasPendingEdits: () => pendingWrites.current > 0 || failedWrite.current, flush,
  }));
  React.useEffect(() => () => onGestureActive?.(false), [onGestureActive]);
  const pick = (clip: (typeof timeline)[number]) => {
    preview.stop();
    if (multi) {
      setGroupIds((ids) => ids.includes(clip.id) ? ids.filter((id) => id !== clip.id) : [...ids, clip.id]);
      select(clip.id);
      return;
    }
    select(clip.id);
    if (preview.position < clip.startMs || preview.position >= clip.endMs) preview.setPosition(clip.startMs);
  };
  const undo = () => {
    if (!past.length) return;
    editVersion.current++;
    preview.stop(); setFuture([clips, ...future]); setClips(past[past.length - 1]); setPast(past.slice(0, -1));
    void persist(past[past.length - 1]);
  };
  const redo = () => {
    if (!future.length) return;
    editVersion.current++;
    preview.stop(); setPast([...past, clips]); setClips(future[0]); setFuture(future.slice(1));
    void persist(future[0]);
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
    const idsToReplace = replaceId;
    const request = session.current;
    const version = editVersion.current;
    const item = downloaded.find((track) => track.spotifyId === ids[0]);
    if (!idsToReplace?.length || !item) return;
    try {
      if (!await getExistingLocalAudioPath(item.localAudioPath, 0)) throw new Error('Baixe a música antes de substituí-la.');
      if (request !== session.current) return;
      if (version !== editVersion.current) { Alert.alert('Mix', 'O mix mudou. Escolha a substituição novamente.'); return; }
      const source = sources.find((track) => track.spotifyId === item.spotifyId) || item;
      const nextSources = sources.includes(source) ? sources : [...sources, source];
      commit(idsToReplace.reduce((next, id) => replaceMixClipSource(next, id, source), clips), 'replace-source', nextSources);
    } catch (error) { if (request === session.current) Alert.alert('Mix', String(error)); }
  };
  const copyClip = () => {
    if (selection.length) setClipboard(selection.map((clip) => ({ ...clip, ...(clip.beatsMs ? { beatsMs: [...clip.beatsMs] } : {}) })));
  };
  const insertCopy = (duplicate: boolean) => {
    const items = duplicate ? selection : clipboard;
    if (!items.length) return;
    if (items.length > 1) {
      const ids = items.map(() => createMixId());
      const base = duplicate ? Math.max(...items.map((clip) => clip.endMs)) : preview.position;
      const next = insertMixGroupCopy(clips, items, ids, base);
      if (next === clips) { Alert.alert('Mix', 'Não há espaço disponível para copiar a seleção.'); return; }
      if (commit(next, duplicate ? 'duplicate' : 'paste')) { setMulti(true); setGroupIds(ids); select(ids[0]); }
      return;
    }
    const first = Math.min(...items.map((clip) => clip.startMs));
    const base = duplicate ? Math.max(...items.map((clip) => clip.endMs)) : preview.position;
    const ids: string[] = [];
    let next = clips;
    for (const clip of items) {
      const id = createMixId();
      const { startMs, endMs: _end, ...source } = clip;
      const result = insertMixClipCopy(next, source, id, items.length === 1 ? selected?.lane ?? clip.lane : clip.lane,
        base + startMs - first, duplicate || items.length > 1);
      if (!result.some((item) => item.id === id)) { Alert.alert('Mix', 'Não há espaço disponível para copiar a seleção.'); return; }
      next = result; ids.push(id);
    }
    if (commit(next, duplicate ? 'duplicate' : 'paste')) { select(ids[0]); if (multi) setGroupIds(ids); }
  };
  const openSlip = () => {
    if (!selected || !track || track.duration_ms <= clipDuration(selected)) return;
    preview.stop();
    setSlip({ id: selected.id, sourceStart: selected.sourceStartMs });
    preview.setPosition(selected.startMs + clipDuration(selected) / 2);
  };
  const cancelSlip = () => { preview.stop(); setSlip(null); onGestureActive?.(false); };
  const applySlip = () => {
    if (slip && track) commit(slipChanges(slip.sourceStart), 'slip');
    cancelSlip();
  };
  const playbackClips = slip && track ? slipChanges(slip.sourceStart) : clips;
  const toggleCursorSelection = () => {
    preview.stop();
    if (multi) { setMulti(false); setGroupIds([]); select(selected?.id || ''); }
    else { setMulti(true); setGroupIds(selected ? [selected.id] : []); }
  };
  const addBeatAtCursor = () => {
    const times = new Map(atCursor.map((clip) => [clip.id, Math.round(clip.sourceStartMs + preview.position - clip.startMs)]));
    commit(clips.map((clip) => times.has(clip.id) ? { ...clip, beatsMs: [...new Set([...(clip.beatsMs || []), times.get(clip.id)!])].sort((a,b) => a-b) } : clip), 'beat-at-cursor');
  };
  const header = <View testID="mix-editor-panel" style={S.headerContent}>
    <View style={S.transport}>
      <View style={S.transportSide}>
        <Tool transport label="Adicionar batida no cursor" icon={TagPlus} disabled={!!slip || !atCursor.length} onPress={addBeatAtCursor} />
        <Tool transport label="Seleção múltipla" icon={CopyCheck} selected={multi} disabled={!!slip} onPress={toggleCursorSelection} />
      </View>
      <View style={S.centerTransport}><Tool transport filled label={preview.playing || preview.busy ? 'Parar prévia' : 'Ouvir mix'} icon={preview.playing || preview.busy ? Pause : Play}
        disabled={!clips.length} onPress={() => { if (!preview.playing && !preview.busy) onPreviewStart?.(); void preview.toggle({ ...project, tracks: sources, clips: playbackClips },
          selected && !grouped ? (preview.position >= selected.startMs && preview.position < selected.endMs ? preview.position : selected.startMs)
            : preview.position >= total ? 0 : preview.position, grouped ? selection.map((clip) => clip.id) : selected?.id); }} selected={preview.playing} /></View>
      <View style={[S.transportSide, S.history]}>
        <Tool transport label="Desfazer" icon={Undo2} disabled={!past.length || !!slip} onPress={undo} />
        <Tool transport label="Refazer" icon={Redo2} disabled={!future.length || !!slip} onPress={redo} />
      </View>
    </View>
    {preview.error ? <Text accessibilityRole="alert" style={S.error}>{preview.error}</Text> : null}
    <MixTimelineEditor timeline={timeline} total={total} tracks={tracks} selectedId={selected?.id || ''} selectedIds={selectionIds} position={preview.position}
      mutedLanes={mutedLanes} onToggleLaneMute={toggleLaneMute}
      playing={preview.playing} disabled={false} onSelect={pick} onSeek={preview.setPosition} onScrub={preview.stop}
      onTrim={(id, range) => commit(grouped && selectionIds.has(id) ? trimMixGroup(clips, selectionIds, id, range, sourceDuration) : trimMixClipAtPosition(clips, id, range[0], range[1]), 'trim-handle')}
      onDragSelect={(id) => { select(id); if (multi && !selectionIds.has(id)) setGroupIds([id]); }}
      onMoveClip={(id, lane, ms) => commit(grouped && selectionIds.has(id) ? moveMixGroup(clips, selectionIds, id, lane, ms) : placeMixClip(clips, id, lane, ms), 'drag-clip')}
      onDeselect={() => { preview.stop(); select(''); setGroupIds([]); }}
      onAddTrack={openPicker} onTrimActive={onGestureActive}
      slip={slip ? { ...slip, onChange: (sourceStart) => { preview.stop(); const bounded = slipChanges(sourceStart).find((clip) => clip.id === slip.id)?.sourceStartMs ?? sourceStart; setSlip((old) => old ? { ...old, sourceStart: bounded } : old); } } : undefined} />
    {slip && selected ? <View style={S.slipTools}>
      <Tool label="Cancelar deslizar" icon={X} onPress={cancelSlip} />
      <View style={S.slipText}><Text style={S.secondary}>Arraste para selecionar o trecho do áudio que você quer incluir</Text>
        <Text style={S.slipRange}>{formatMixTime(slip.sourceStart)} – {formatMixTime(slip.sourceStart + clipDuration(selected))} · {formatMixTime(clipDuration(selected))}</Text></View>
      <Tool label="Aplicar deslizar" icon={Check} onPress={applySlip} />
    </View> : <View testID="mix-editor-toolbar" style={S.inspector}>
      {multi ? <Text style={[S.secondary, { paddingHorizontal: 8 }]}>{selection.length} clipes selecionados</Text> : null}
      <HorizontalFadeScrollView fadeColor={COLORS.PRIMARY} fadeWidth={30} contentContainerStyle={S.editTools}>
        <Tool label="Dividir no cursor" caption="Dividir" icon={Scissors} disabled={!splittable.length}
          onPress={() => commit(splittable.reduce((next, clip) => splitMixClip(next, clip.id, preview.position), clips), 'split')} />
        <Tool label="Volume do clipe" caption="Volume" icon={Volume2} hasIndicator={hasAudioMods} disabled={!selected || !track} onPress={() => {
          if (!selected) return;
          effectChanges.current = {};
          preview.stop(); setVolume(selected.volume); setDuckAmount(selected.duckAmount || 0);
          setFadeInMs(selected.fadeInMs || 0); setFadeOutMs(selected.fadeOutMs || 0);
          setAudioTab('volume'); setPanel('volume');
        }} />
        <Tool label="Batidas do clipe" caption="Batidas" icon={AudioLines} hasIndicator={hasBeatMods} disabled={!selected || !track} onPress={() => {
          if (!selected) return;
          preview.stop(); if (preview.position < selected.startMs || preview.position >= selected.endMs) preview.setPosition(selected.startMs);
          setPanel('beats');
        }} />
        <Tool label="Substituir clipe" caption="Substituir" icon={ArrowLeftRight} disabled={!selected} onPress={() => { if (selected) { preview.stop(); setReplaceId(selection.map((clip) => clip.id)); } }} />
        <Tool label="Copiar clipe" caption="Copiar" icon={Copy} disabled={!selected} onPress={copyClip} />
        <Tool label="Colar clipe" caption="Colar" icon={ClipboardPaste} disabled={!clipboard.length} onPress={() => insertCopy(false)} />
        <Tool label="Duplicar clipe" caption="Duplicar" icon={CopyPlus} disabled={!selected} onPress={() => insertCopy(true)} />
        <Tool label="Deslizar clipe" caption="Deslizar" icon={MoveHorizontal} hasIndicator={hasSourceMods} disabled={!selected || !track || track.duration_ms <= clipDuration(selected)} onPress={openSlip} />
        <Tool label="Remover clipe" caption="Excluir" icon={Trash2} disabled={!selected} onPress={() => { if (selected) { commit(clips.filter((clip) => !selectionIds.has(clip.id)), 'remove'); select(''); setGroupIds([]); } }} />
        <Tool label="Mover clipe antes" icon={ChevronLeft} disabled={!selected || grouped || !timeline.some((c) => c.lane === selected.lane && c.startMs < selected.startMs)}
          onPress={() => {
            if (!selected) return;
            const index = timeline.findIndex((c) => c.id === selected.id);
            const previous = timeline.slice(0, index).map((c) => c.lane).lastIndexOf(selected.lane);
            if (previous >= 0) commit(moveMixClip(clips, index, previous), 'reorder');
          }} />
        <Tool label="Mover clipe depois" icon={ChevronRight} disabled={!selected || grouped || !timeline.some((c) => c.lane === selected.lane && c.startMs > selected.startMs)}
          onPress={() => {
            if (!selected) return;
            const index = timeline.findIndex((c) => c.id === selected.id);
            const next = timeline.findIndex((c, i) => i > index && c.lane === selected.lane);
            if (next >= 0) commit(moveMixClip(clips, index, next), 'reorder');
          }} />
      </HorizontalFadeScrollView>
    </View>}
  </View>;

  return <View testID="mix-inline-editor" style={S.inline}>
    {header}
    {saveError ? <LoggedPressable accessibilityRole="button" accessibilityLabel="Tentar salvar novamente" onPress={() => void persist(clips)}>
      <Text style={S.error}>Não foi possível salvar: {saveError}. Tentar novamente.</Text>
    </LoggedPressable> : null}
    {pickerLane !== null ? <PlaylistTrackPickerModal visible tracks={downloaded} existingTrackIds={[]}
      onClose={() => setPickerLane(null)} onConfirm={(ids) => void addSources(ids)} /> : null}{replaceId !== null ? <PlaylistTrackPickerModal visible tracks={downloaded}
      existingTrackIds={[]} singleSelection title="Substituir música" actionLabel="Substituir música"
      onClose={() => setReplaceId(null)} onConfirm={(ids) => void replaceSource(ids)} /> : null}{panel === 'volume' && selected ? <SheetFrame visible title="Áudio" size="sheet" dimBackdrop={false} centerTitle
      onClose={() => setPanel(null)} hideDefaultClose headerLeading={<HeaderIconButton icon="x" label="Cancelar volume" onPress={() => setPanel(null)} />}
      headerTrailing={<PlaylistSheetAction label="Aplicar volume" onPress={() => {
        commit(applyMixGroupEffects(clips, selectionIds, effectChanges.current), 'audio-effects'); setPanel(null);
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
        minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFFFFF" onValueChange={(v) => { effectChanges.current.volume = v; setVolume(v); }} />
      </> : audioTab === 'duck' ? <>
        <View style={S.rangeLabel}><Text style={S.secondary}>Reduzir volume na sobreposição</Text><Text style={S.value}>{Math.round(duckAmount * 100)}%</Text></View>
        <Slider accessibilityLabel="Ajustar redução automática" value={duckAmount} minimumValue={0} maximumValue={1} step={0.01}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={(v) => { effectChanges.current.duckAmount = v; setDuckAmount(v); }} />
        <Text style={S.secondary}>Reduz o volume deste clipe quando outra faixa de áudio está tocando.</Text>
      </> : <>
        <View style={S.rangeLabel}><Text style={S.secondary}>Aparecimento gradual</Text><Text style={S.value}>{(fadeInMs / 1000).toFixed(1)} s</Text></View>
        <Slider accessibilityLabel="Ajustar aparecimento gradual" value={fadeInMs} minimumValue={0} maximumValue={Math.max(0, Math.min(30000, selected.endMs - selected.startMs - fadeOutMs))} step={100}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={(v) => { effectChanges.current.fadeInMs = v; setFadeInMs(v); }} />
        <View style={S.rangeLabel}><Text style={S.secondary}>Desaparecimento gradual</Text><Text style={S.value}>{(fadeOutMs / 1000).toFixed(1)} s</Text></View>
        <Slider accessibilityLabel="Ajustar desaparecimento gradual" value={fadeOutMs} minimumValue={0} maximumValue={Math.max(0, Math.min(30000, selected.endMs - selected.startMs - fadeInMs))} step={100}
          minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" onValueChange={(v) => { effectChanges.current.fadeOutMs = v; setFadeOutMs(v); }} />
      </>}
    </SheetFrame> : null}{panel === 'beats' && selected && track ? <MixBeatSheet initialId={selected.id}
      targets={selection.map((clip) => { const source = tracks.get(clip.trackId); return { clip, duration: source?.duration_ms ?? clip.sourceEndMs, uri: source?.localAudioPath, title: source?.title || 'Áudio' }; })}
      position={preview.position} playing={preview.playing || preview.busy}
      onSeek={(ms) => { preview.stop(); preview.setPosition(ms); }}
      onPlay={() => { if (!preview.playing && !preview.busy) onPreviewStart?.(); void preview.toggle({ ...project, tracks: sources, clips }, preview.position, grouped ? selection.map((clip) => clip.id) : selected.id); }}
      onClose={() => { preview.stop(); setPanel(null); }}
      onApply={(marks) => { preview.stop(); commit(clips.map((clip) => marks.has(clip.id) && JSON.stringify(marks.get(clip.id)) !== JSON.stringify(clip.beatsMs || []) ? { ...clip, beatsMs: marks.get(clip.id)! } : clip), 'beats'); setPanel(null); }} /> : null}
  </View>;
}

const S = StyleSheet.create({
  inline: { marginHorizontal: 14, marginBottom: 16 },
  headerContent: { gap: 0, backgroundColor: COLORS.PRIMARY, borderRadius: 12, overflow: 'hidden' }, transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, backgroundColor: COLORS.PRIMARY, paddingHorizontal: 8 },
  tool: { minWidth: 40, minHeight: 40, gap: 3, alignItems: 'center', justifyContent: 'center' },
  toolCaption: { fontSize: 11, color: '#ABABB2', fontFamily: 'SF-Regular' },
  toolIndicator: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  toolIndicatorActive: { backgroundColor: '#FFCF20' },
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
  slipTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, backgroundColor: COLORS.PRIMARY },
  slipText: { flex: 1, alignItems: 'center', paddingHorizontal: 6, gap: 4 },
  slipRange: { color: '#FFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#FF9F9F', fontSize: 13 },
});
