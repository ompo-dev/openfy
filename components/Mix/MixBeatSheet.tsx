import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HorizontalFadeEdges, HorizontalFadeScrollView } from '../common/HorizontalFadeScrollView';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Line, Circle } from 'react-native-svg';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import Plus from 'lucide-react-native/icons/plus';
import Minus from 'lucide-react-native/icons/minus';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import { COLORS } from '@config';
import { SheetFrame, LoggedPressable } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { loadMixWaveform, loadMixRhythm } from '../../services/mix/mixWaveform';
import { detectMixBeats, trackMixRhythm, type RhythmAnalysis, type BeatDensity } from '../../services/mix/mixBeats';
import { MixWaveTiles } from './MixWaveTiles';
import { formatMixTime, type mixTimeline } from '../../services/mix/mixTimeline';

type Entry = ReturnType<typeof mixTimeline>[number];
export type BeatTarget = { clip: Entry; duration: number; uri?: string; title: string };
type Analysis = { peaks: number[]; rhythm: RhythmAnalysis | null };
const WINDOW_MS = 8000;
const sourceAt = (clip: Entry, position: number) => Math.round(Math.max(clip.sourceStartMs, Math.min(clip.sourceEndMs - 1, clip.sourceStartMs + position - clip.startMs)));
const nearest = (beats: number[], ms: number) => beats.reduce<number | undefined>((best, beat) =>
  Math.abs(beat - ms) <= 90 && (best === undefined || Math.abs(beat - ms) < Math.abs(best - ms)) ? beat : best, undefined);

export function MixBeatSheet({ targets, initialId, position, playing, onSeek, onPlay, onClose, onApply }: {
  targets: BeatTarget[]; initialId: string; position: number; playing: boolean;
  onSeek: (ms: number) => void; onPlay: () => void; onClose: () => void; onApply: (beats: Map<string, number[]>) => void;
}) {
  const [focusId, setFocusId] = React.useState(initialId);
  const target = targets.find((item) => item.clip.id === focusId) || targets[0];
  const { clip, duration, uri } = target;
  const [draft, setDraft] = React.useState(() => new Map(targets.map(({ clip }) => [clip.id, clip.beatsMs || []])));
  const [density, setDensity] = React.useState<BeatDensity | null>(() => targets.some(({ clip }) => clip.beatsMs?.length) ? null : 'off');
  const [peaks, setPeaks] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [width, setWidth] = React.useState(320);
  const alive = React.useRef(true);
  const analyses = React.useRef(new Map<string, Promise<Analysis>>());
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const analyze = React.useCallback((item: BeatTarget) => {
    const key = item.clip.trackId;
    let job = analyses.current.get(key);
    if (!job) {
      job = Promise.all([
        loadMixWaveform(item.uri, key, true).catch(() => [] as number[]),
        loadMixRhythm(item.uri, key).catch(() => null),
      ]).then(([wave, rhythm]) => ({ peaks: wave, rhythm }));
      analyses.current.set(key, job);
    }
    return job;
  }, []);
  React.useEffect(() => {
    let active = true;
    setPeaks([]); setLoading(true);
    void analyze({ clip, duration, uri, title: '' }).then((result) => {
      if (active) { setPeaks(result.peaks); setLoading(false); }
    });
    return () => { active = false; };
  }, [clip, duration, uri, analyze]);
  const latest = React.useRef({ clip, position, width, onSeek });
  latest.current = { clip, position, width, onSeek };
  const origin = React.useRef(0);
  const scrub = React.useMemo(() => Gesture.Pan().runOnJS(true).activeOffsetX([-4, 4]).failOffsetY([-12, 12])
    .onStart(() => { const { clip, position } = latest.current; origin.current = Math.max(clip.startMs, Math.min(clip.endMs - 1, position)); })
    .onUpdate(({ translationX }) => {
      const { clip, width, onSeek } = latest.current;
      onSeek(Math.round(Math.max(clip.startMs, Math.min(clip.endMs - 1, origin.current - translationX * WINDOW_MS / width))));
    }), []);
  const cursor = Math.max(clip.startMs, Math.min(clip.endMs - 1, position));
  const sourcePosition = sourceAt(clip, cursor);
  const beats = draft.get(clip.id) || [];
  const start = sourcePosition - WINDOW_MS / 2, end = start + WINDOW_MS;
  const waveScale = width / WINDOW_MS;
  const visibleStart = Math.max(0, start), visibleEnd = Math.min(duration, end);
  const x = (ms: number) => (ms - start) / WINDOW_MS * 320;
  const near = nearest(beats, sourcePosition);
  const generate = async (mode: BeatDensity) => {
    if (busy) return;
    setMessage('');
    if (mode === 'off') {
      setDraft(new Map(targets.map(({ clip }) => [clip.id, []]))); setDensity('off'); return;
    }
    setBusy(true);
    try {
      const next = new Map<string, number[]>();
      for (const item of targets) {
        const { peaks, rhythm } = await analyze(item);
        if (!alive.current) return;
        if (!rhythm && !peaks.length) throw new Error('Não foi possível analisar todos os clipes selecionados.');
        next.set(item.clip.id, rhythm ? trackMixRhythm(rhythm, item.clip.sourceStartMs, item.clip.sourceEndMs, mode)
          : detectMixBeats(peaks, item.duration, item.clip.sourceStartMs, item.clip.sourceEndMs, mode));
      }
      if (alive.current) { setDraft(next); setDensity(mode); }
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : String(error));
    } finally { if (alive.current) setBusy(false); }
  };
  const editMarker = () => {
    setDensity(null);
    // Apply manual edits at the common timeline cursor, only to clips crossing it.
    setDraft((old) => {
      const next = new Map(old);
      for (const { clip: item } of targets) {
        if (cursor < item.startMs || cursor >= item.endMs) continue;
        const ms = sourceAt(item, cursor), marks = old.get(item.id) || [];
        const existing = nearest(marks, ms);
        if (near !== undefined) {
          if (existing !== undefined) next.set(item.id, marks.filter((mark) => mark !== existing));
        } else if (existing === undefined && marks.length < 10000) {
          next.set(item.id, [...marks, ms].sort((a,b) => a-b));
        }
      }
      return next;
    });
  };
  return <SheetFrame visible title="Batidas" size="sheet" centerTitle hideDefaultClose dimBackdrop={false}
    onClose={onClose} headerLeading={<HeaderIconButton icon="x" label="Cancelar batidas" onPress={onClose} />}
    headerTrailing={<PlaylistSheetAction label="Aplicar batidas" disabled={busy} busy={busy} onPress={() => onApply(draft)} />}>
    <View style={S.transport} testID="mix-beat-transport">
      <LoggedPressable style={S.play} accessibilityLabel={playing ? 'Pausar batidas' : 'Ouvir batidas'} onPress={onPlay}>
        {playing ? <Pause size={24} color="#FFF" /> : <Play size={24} color="#FFF" />}
      </LoggedPressable>
      <View style={S.tabs}>
        {([['off','Desativado'],['less','Menos'],['more','Mais']] as const).map(([mode,label]) =>
          <LoggedPressable key={mode} disabled={busy} accessibilityLabel={label} accessibilityState={{ selected: density === mode }}
            onPress={() => void generate(mode)} style={[S.tab, density === mode && S.active]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[S.tabText, density === mode && { color: '#111' }]}>{label}</Text>
          </LoggedPressable>)}
        <LoggedPressable disabled={busy} accessibilityLabel="Limpar batidas" onPress={() => void generate('off')} style={S.reset}><RotateCcw size={19} color="#FFF" /></LoggedPressable>
      </View>
    </View>
    {targets.length > 1 ? <HorizontalFadeScrollView fadeMode="mask" fadeWidth={12} contentContainerStyle={S.targets}>
      {targets.map(({ clip: item, title }, index) => <LoggedPressable key={item.id} accessibilityRole="tab"
        accessibilityLabel={`Ver batidas do clipe ${index + 1}: ${title}`} accessibilityState={{ selected: item.id === clip.id }}
        onPress={() => { setFocusId(item.id); onSeek(Math.max(item.startMs, Math.min(item.endMs - 1, position))); }}
        style={[S.target, item.id === clip.id && S.targetActive]}><Text numberOfLines={1} style={S.tabText}>{index + 1}. {title}</Text></LoggedPressable>)}
    </HorizontalFadeScrollView> : null}
    <View style={S.waveHeader}><Text style={S.secondary}>{targets.length > 1 ? `${targets.length} clipes selecionados` : ''}</Text>
      <Text style={S.text}>{formatMixTime(sourcePosition - clip.sourceStartMs)} / {formatMixTime(clip.sourceEndMs - clip.sourceStartMs)}</Text></View>
    <View style={S.wave} testID="mix-beat-wave">
      <GestureDetector gesture={scrub}><View collapsable={false} accessible accessibilityLabel="Navegar pelas batidas" accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: clip.endMs - clip.startMs - 1, now: cursor - clip.startMs }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => onSeek(Math.max(clip.startMs, Math.min(clip.endMs - 1, cursor + (nativeEvent.actionName === 'increment' ? 1000 : -1000))))}
        onLayout={({ nativeEvent }) => setWidth(Math.max(1, nativeEvent.layout.width))}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: -start * waveScale, width: duration * waveScale, height: 100 }}>
          <MixWaveTiles peaks={peaks} duration={duration} sourceStart={0} sourceEnd={duration} scale={waveScale}
            visibleStart={visibleStart * waveScale} visibleEnd={visibleEnd * waveScale} height={100} color="#626E7C" symmetric />
        </View>
        <Svg width="100%" height={110} viewBox="0 0 320 110" preserveAspectRatio="none">
          {beats.filter((ms) => ms >= start && ms <= end).map((ms) => <React.Fragment key={ms}>
            <Line x1={x(ms)} y1={3} x2={x(ms)} y2={96} stroke="#BEC4CC" strokeDasharray="2 3" />
            <Circle testID={`mix-beat-dot-${ms}`} cx={x(ms)} cy={104} r={3} fill={ms <= sourcePosition ? '#FFCF20' : '#FFF'} />
          </React.Fragment>)}
          <Line x1={160} y1={2} x2={160} y2={96} stroke="#FFF" strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      </View></GestureDetector>
      <HorizontalFadeEdges left={start > 0} right={end < duration} width={12} color={COLORS.SECONDARY} />
      <LoggedPressable style={S.markerButton} disabled={busy} accessibilityLabel={near === undefined ? 'Adicionar batida' : 'Remover batida'} onPress={editMarker}>
        {near === undefined ? <Plus size={22} color="#FFF" /> : <Minus size={22} color="#FFF" />}
      </LoggedPressable>
    </View>
    {busy || loading || message ? <Text style={S.secondary}>{message || 'Analisando áudio…'}</Text> : null}
  </SheetFrame>;
}
const S = StyleSheet.create({
  transport: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  play: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  waveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wave: { backgroundColor: COLORS.SECONDARY, borderRadius: 8, overflow: 'hidden' },
  text: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  secondary: { color: '#AAAEB5', fontSize: 12 },
  markerButton: { position: 'absolute', right: 6, top: 6, width: 34, height: 34, borderRadius: 8, backgroundColor: '#121212D9', alignItems: 'center', justifyContent: 'center', zIndex: 11 },
  tabs: { flex: 1, flexDirection: 'row', gap: 2, backgroundColor: COLORS.SECONDARY, borderRadius: 10, padding: 3 },
  tab: { flex: 1, minHeight: 34, paddingHorizontal: 2, justifyContent: 'center', alignItems: 'center', borderRadius: 7 },
  tabText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  reset: { width: 30, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: '#FFF' },
  targets: { gap: 6, alignItems: 'center' },
  target: { maxWidth: 160, padding: 8, borderRadius: 8, backgroundColor: COLORS.SECONDARY, borderWidth: 1, borderColor: 'transparent' },
  targetActive: { borderColor: '#FFCF20' },
});
