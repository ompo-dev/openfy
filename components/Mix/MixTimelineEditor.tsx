import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Polygon } from 'react-native-svg';
import Plus from 'lucide-react-native/icons/plus';
import { LoggedPressable } from '../native';
import { formatMixTime, MIN_CLIP_MS, type MixClip, mixTimeline } from '../../services/mix/mixTimeline';
import type { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import { loadMixWaveform, waveformSlice } from '../../services/mix/mixWaveform';

type Entry = ReturnType<typeof mixTimeline>[number];
type Source = ReturnType<typeof mergeMixTrack>;
const BASE_SCALE = 0.045;
const STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];
export const timelineScale = (zoom: number, total: number) =>
  Math.min(BASE_SCALE * Math.max(0.0625, Math.min(8, zoom)), 500000 / Math.max(total, 1));
export const positionAtOffset = (offset: number, scale: number, total: number) =>
  Math.max(0, Math.min(total, Math.round(offset / scale)));
export const trimAtOffset = (clip: MixClip, edge: 'start' | 'end', dx: number, scale: number, sourceDuration: number): [number, number] => {
  const delta = Math.round(dx / scale / 10) * 10;
  return edge === 'start'
    ? [Math.max(0, Math.min(clip.sourceEndMs - MIN_CLIP_MS, clip.sourceStartMs + delta)), clip.sourceEndMs]
    : [clip.sourceStartMs, Math.min(sourceDuration, Math.max(clip.sourceStartMs + MIN_CLIP_MS, clip.sourceEndMs + delta))];
};

function TrimHandle({ edge, clip, sourceDuration, scale, scrollGesture, onBegin, onChange, onEnd }: {
  edge: 'start' | 'end'; clip: Entry; sourceDuration: number; scale: number;
  scrollGesture: ReturnType<typeof Gesture.Native>;
  onBegin: () => void; onChange: (range: [number, number]) => void; onEnd: (range?: [number, number]) => void;
}) {
  const latest = React.useRef({ edge, clip, sourceDuration, scale, onBegin, onChange, onEnd });
  latest.current = { edge, clip, sourceDuration, scale, onBegin, onChange, onEnd };
  const origin = React.useRef(latest.current);
  const active = React.useRef(false);
  const gesture = React.useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0).maxPointers(1)
    .blocksExternalGesture(scrollGesture)
    .onStart(() => { origin.current = latest.current; active.current = true; origin.current.onBegin(); })
    .onUpdate((g) => {
      const o = origin.current;
      o.onChange(trimAtOffset(o.clip, o.edge, g.translationX, o.scale, o.sourceDuration));
    })
    .onEnd((g) => {
      const o = origin.current;
      active.current = false;
      o.onEnd(trimAtOffset(o.clip, o.edge, g.translationX, o.scale, o.sourceDuration));
    })
    .onFinalize(() => { if (active.current) { active.current = false; origin.current.onEnd(); } }), [scrollGesture]);
  return <GestureDetector gesture={gesture}><View collapsable={false} accessibilityRole="adjustable"
    accessibilityLabel={edge === 'start' ? 'Arrastar início do clipe' : 'Arrastar fim do clipe'}
    accessibilityActions={[{ name: 'increment', label: 'Avançar 100 ms' }, { name: 'decrement', label: 'Voltar 100 ms' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      const o = latest.current;
      const delta = nativeEvent.actionName === 'increment' ? 100 : -100;
      o.onBegin(); o.onEnd(trimAtOffset(o.clip, o.edge, delta * o.scale, o.scale, o.sourceDuration));
    }}
    style={[S.handle, edge === 'start' ? S.handleStart : S.handleEnd]}><View style={S.grip} /></View></GestureDetector>;
}

function ClipWaveform({ source, range }: { source?: Source; range: number[] }) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  React.useEffect(() => {
    let current = true;
    setPeaks([]);
    void loadMixWaveform(source?.localAudioPath).then((values) => { if (current) setPeaks(values); }).catch(() => {});
    return () => { current = false; };
  }, [source?.localAudioPath]);
  const values = waveformSlice(peaks, range[0], range[1], source?.duration_ms || 0, 120);
  if (!values.length) return null;
  const points = ['0,40', ...values.map((v, i) => `${i * 120 / Math.max(1, values.length - 1)},${40 - v * 38}`), '120,40'].join(' ');
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" viewBox="0 0 120 40" preserveAspectRatio="none">
    <Polygon points={points} fill="#720067" fillOpacity={0.75} />
  </Svg></View>;
}

export function MixTimelineEditor({ timeline, total, tracks, selectedId, position, playing, disabled, onSelect, onSeek, onScrub, onTrim, onAddTrack }: {
  timeline: Entry[]; total: number; tracks: Map<string, Source>; selectedId: string; position: number;
  playing: boolean; disabled: boolean; onSelect: (clip: Entry) => void; onSeek: (ms: number) => void;
  onScrub: () => void; onTrim: (id: string, range: [number, number]) => void;
  onAddTrack: (lane: number) => void;
}) {
  const [width, setWidth] = React.useState(320);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState(0);
  const [pinching, setPinching] = React.useState(false);
  const [draft, setDraft] = React.useState<{ id: string; range: [number, number] } | null>(null);
  const [trimming, setTrimming] = React.useState(false);
  const scroll = React.useRef<ScrollView>(null);
  const dragging = React.useRef(false);
  const pinchActive = React.useRef(false);
  const zoomOrigin = React.useRef(1);
  const trimActive = React.useRef(false);
  const scale = timelineScale(zoom, total);
  const latest = React.useRef({ zoom, onScrub, disabled });
  latest.current = { zoom, onScrub, disabled };
  const pinch = React.useMemo(() => Gesture.Pinch().runOnJS(true)
    .onStart(() => {
      if (latest.current.disabled || trimActive.current) return;
      pinchActive.current = true; dragging.current = false; zoomOrigin.current = latest.current.zoom;
      latest.current.onScrub(); setPinching(true);
    })
    .onUpdate((event) => {
      if (pinchActive.current) setZoom(Math.max(0.0625, Math.min(8, zoomOrigin.current * event.scale)));
    })
    .onFinalize(() => { pinchActive.current = false; setPinching(false); }), []);
  const nativeScroll = React.useMemo(() => Gesture.Native(), []);
  const gestures = React.useMemo(() => Gesture.Simultaneous(pinch, nativeScroll), [pinch, nativeScroll]);
  React.useEffect(() => {
    if (dragging.current || trimming) return;
    const x = Math.min(total, Math.max(0, position)) * scale;
    scroll.current?.scrollTo({ x, y: 0, animated: false });
    setOffset(x);
  }, [position, scale, total, trimming]);
  const step = STEPS.find((value) => value * scale >= 48) || Math.ceil(48 / scale / 3600000) * 3600000;
  const first = Math.max(0, Math.floor((offset - width) / (step * scale)));
  const last = Math.min(Math.ceil(total / step), Math.ceil((offset + width * 2) / (step * scale)));
  const ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * step);
  const lanes = Math.max(1, ...timeline.map((clip) => clip.lane + 1));
  const laneEnds = Array.from({ length: lanes }, (_, lane) => timeline.reduce((end, clip) => clip.lane === lane ? Math.max(end, clip.endMs) : end, 0));
  const displayed = draft ? mixTimeline(timeline.map((clip) => clip.id === draft.id
    ? { ...clip, sourceStartMs: draft.range[0], sourceEndMs: draft.range[1] } : clip)) : timeline;
  const height = 66 + lanes * 46;
  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current || pinchActive.current || trimActive.current) return;
    setOffset(nativeEvent.contentOffset.x);
    onSeek(positionAtOffset(nativeEvent.contentOffset.x, scale, total));
  };
  return <View testID="mix-timeline-viewport" onLayout={({ nativeEvent }) => setWidth(Math.max(1, nativeEvent.layout.width))} style={[S.viewport, { height }]}>
    <GestureDetector gesture={gestures}>
      <ScrollView ref={scroll} horizontal testID="mix-timeline-scroll" showsHorizontalScrollIndicator={false}
        scrollEnabled={!disabled && !pinching} bounces={false} scrollEventThrottle={16}
        onScrollBeginDrag={() => { if (!pinchActive.current && !trimActive.current) { dragging.current = true; onScrub(); } }}
        onMomentumScrollBegin={() => { if (!pinchActive.current && !trimActive.current) dragging.current = true; }}
        onScroll={handleScroll} onMomentumScrollEnd={(event) => { handleScroll(event); dragging.current = false; }}
        onScrollEndDrag={(event) => { handleScroll(event); if (!event.nativeEvent.velocity?.x) dragging.current = false; }}>
        <View accessibilityLabel="Timeline do mix" style={[S.content, { height: height - 22, width: total * scale + width }]}>
          {laneEnds.map((_, lane) => <View key={lane} pointerEvents="none" style={[S.lane, { top: 36 + lane * 46, left: width / 2, width: Math.max(1, total * scale) }]} />)}
          {ticks.map((time) => <View key={time} pointerEvents="none" style={[S.tick, { left: width / 2 + time * scale }]}>
            <Text style={S.tickLabel}>{time < 60000 ? `${Number((time / 1000).toFixed(1))}s` : formatMixTime(time)}</Text>
            <View style={S.tickMark} />
          </View>)}
          {displayed.map((clip, index) => {
            const original = timeline[index];
            const source = tracks.get(clip.trackId);
            const selected = clip.id === selectedId;
            const range = draft?.id === clip.id ? draft.range : [clip.sourceStartMs, clip.sourceEndMs];
            const clipWidth = Math.max(1, (range[1] - range[0]) * scale);
            const left = width / 2 + clip.startMs * scale;
            if (!selected && (left + clipWidth < offset - width || left > offset + width * 2)) return null;
            return <View key={clip.id} style={[S.clip, { top: 36 + clip.lane * 46, left: selected ? left - 12 : left, width: selected ? clipWidth + 24 : clipWidth }, selected && S.selected]}>
              <LoggedPressable disabled={disabled} accessibilityLabel={`Selecionar clipe ${index + 1}: ${source?.title}`}
                onPress={() => onSelect(original)} style={[S.clipBody, selected && S.selectedBody]}>
                <ClipWaveform source={source} range={range} />
                <Text numberOfLines={1} style={S.clipTitle}>{source?.title} <Text style={S.artist}>{source?.artistName}</Text></Text>
                <Text numberOfLines={1} style={S.clipTime}>{formatMixTime(range[1] - range[0])}</Text>
              </LoggedPressable>
              {selected && source && !disabled ? (['start', 'end'] as const).map((edge) => <TrimHandle key={edge} edge={edge}
                clip={original} sourceDuration={source.duration_ms} scale={scale} scrollGesture={nativeScroll} onBegin={() => {
                  trimActive.current = true; dragging.current = false; onScrub(); setTrimming(true);
                }} onChange={(next) => setDraft({ id: clip.id, range: next })} onEnd={(next) => {
                  if (next) onTrim(clip.id, next);
                  trimActive.current = false; setDraft(null); setTrimming(false);
                }} />) : null}
            </View>;
          })}
          {laneEnds.map((end, lane) => <LoggedPressable key={lane} disabled={disabled}
            accessibilityLabel={`Adicionar música à faixa ${lane + 1}`} onPress={() => onAddTrack(lane)}
            style={[S.add, { top: 43 + lane * 46, left: width / 2 + end * scale + 14 }]}><Plus size={20} color="#171717" /></LoggedPressable>)}
        </View>
      </ScrollView>
    </GestureDetector>
    <View pointerEvents="none" testID="mix-fixed-playhead" style={[S.playhead, { left: width / 2 - 1.5, height: height - 26 }]} />
    {playing ? null : <Text pointerEvents="none" style={S.hint}>Deslize para navegar · pinça para zoom</Text>}
  </View>;
}

const S = StyleSheet.create({
  viewport: { height: 108, backgroundColor: '#101418', borderRadius: 12, overflow: 'hidden' },
  content: { height: 86 },
  lane: { position: 'absolute', top: 36, height: 42, backgroundColor: '#20242A' },
  tick: { position: 'absolute', top: 5, alignItems: 'flex-start' },
  tickLabel: { color: '#A5ABB4', fontSize: 11, fontVariant: ['tabular-nums'] },
  tickMark: { width: 2, height: 7, borderRadius: 1, backgroundColor: '#626A74', marginTop: 3 },
  clip: { position: 'absolute', top: 36, height: 42, borderRadius: 5, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#C000A4' },
  selected: { borderColor: '#FFCF20', zIndex: 2 },
  clipBody: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 8, overflow: 'hidden' },
  selectedBody: { marginHorizontal: 12 },
  clipTitle: { color: '#FFF', fontSize: 12, fontFamily: 'SF-Semibold' },
  clipTime: { color: '#FFF', fontSize: 10, fontVariant: ['tabular-nums'] },
  add: { position: 'absolute', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  artist: { fontFamily: 'SF-Regular', color: '#F8D7F5' },
  handle: { position: 'absolute', top: -2, bottom: -2, width: 14, backgroundColor: '#FFCF20', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  handleStart: { left: 0, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  handleEnd: { right: 0, borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  grip: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#151515' },
  playhead: { position: 'absolute', top: 4, height: 80, width: 3, borderRadius: 2, backgroundColor: '#FFF', zIndex: 3 },
  hint: { position: 'absolute', bottom: 4, alignSelf: 'center', color: '#9399A3', fontSize: 10 },
});
