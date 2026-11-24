import * as React from 'react';
import { PanResponder, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LoggedPressable } from '../native';
import { formatMixTime, MIN_CLIP_MS, type MixClip, type mixTimeline } from '../../services/mix/mixTimeline';
import type { mergeMixTrack } from '../../services/mix/mixTrackMetadata';

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

function TrimHandle({ edge, clip, sourceDuration, scale, onBegin, onChange, onEnd }: {
  edge: 'start' | 'end'; clip: Entry; sourceDuration: number; scale: number;
  onBegin: () => void; onChange: (range: [number, number]) => void; onEnd: (range?: [number, number]) => void;
}) {
  const latest = React.useRef({ edge, clip, sourceDuration, scale, onBegin, onChange, onEnd });
  latest.current = { edge, clip, sourceDuration, scale, onBegin, onChange, onEnd };
  const origin = React.useRef(latest.current);
  const responder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { origin.current = latest.current; origin.current.onBegin(); },
    onPanResponderMove: (_, g) => {
      const o = origin.current;
      o.onChange(trimAtOffset(o.clip, o.edge, g.dx, o.scale, o.sourceDuration));
    },
    onPanResponderRelease: (_, g) => {
      const o = origin.current;
      o.onEnd(trimAtOffset(o.clip, o.edge, g.dx, o.scale, o.sourceDuration));
    },
    onPanResponderTerminate: () => origin.current.onEnd(),
  }), []);
  return <View {...responder.panHandlers} accessibilityRole="adjustable"
    accessibilityLabel={edge === 'start' ? 'Arrastar início do clipe' : 'Arrastar fim do clipe'}
    accessibilityActions={[{ name: 'increment', label: 'Avançar 100 ms' }, { name: 'decrement', label: 'Voltar 100 ms' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      const o = latest.current;
      const delta = nativeEvent.actionName === 'increment' ? 100 : -100;
      o.onBegin(); o.onEnd(trimAtOffset(o.clip, o.edge, delta * o.scale, o.scale, o.sourceDuration));
    }}
    style={[S.handle, edge === 'start' ? S.handleStart : S.handleEnd]}><View style={S.grip} /></View>;
}

export function MixTimelineEditor({ timeline, total, tracks, selectedId, position, playing, disabled, onSelect, onSeek, onScrub, onTrim }: {
  timeline: Entry[]; total: number; tracks: Map<string, Source>; selectedId: string; position: number;
  playing: boolean; disabled: boolean; onSelect: (clip: Entry) => void; onSeek: (ms: number) => void;
  onScrub: () => void; onTrim: (id: string, range: [number, number]) => void;
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
  const scale = timelineScale(zoom, total);
  const latest = React.useRef({ zoom, onScrub, disabled });
  latest.current = { zoom, onScrub, disabled };
  const pinch = React.useMemo(() => Gesture.Pinch().runOnJS(true)
    .onStart(() => {
      if (latest.current.disabled) return;
      pinchActive.current = true; dragging.current = false; zoomOrigin.current = latest.current.zoom;
      latest.current.onScrub(); setPinching(true);
    })
    .onUpdate((event) => {
      if (pinchActive.current) setZoom(Math.max(0.0625, Math.min(8, zoomOrigin.current * event.scale)));
    })
    .onFinalize(() => { pinchActive.current = false; setPinching(false); }), []);
  const gestures = React.useMemo(() => Gesture.Simultaneous(pinch, Gesture.Native()), [pinch]);
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
  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current || pinchActive.current || trimming) return;
    setOffset(nativeEvent.contentOffset.x);
    onSeek(positionAtOffset(nativeEvent.contentOffset.x, scale, total));
  };
  return <View testID="mix-timeline-viewport" onLayout={({ nativeEvent }) => setWidth(Math.max(1, nativeEvent.layout.width))} style={S.viewport}>
    <GestureDetector gesture={gestures}>
      <ScrollView ref={scroll} horizontal testID="mix-timeline-scroll" showsHorizontalScrollIndicator={false}
        scrollEnabled={!disabled && !pinching && !trimming} bounces={false} scrollEventThrottle={16}
        onScrollBeginDrag={() => { if (!pinchActive.current) { dragging.current = true; onScrub(); } }}
        onMomentumScrollBegin={() => { if (!pinchActive.current) dragging.current = true; }}
        onScroll={handleScroll} onMomentumScrollEnd={(event) => { handleScroll(event); dragging.current = false; }}
        onScrollEndDrag={(event) => { handleScroll(event); if (!event.nativeEvent.velocity?.x) dragging.current = false; }}>
        <View accessibilityLabel="Timeline do mix" style={[S.content, { width: total * scale + width }]}>
          <View pointerEvents="none" style={[S.lane, { left: width / 2, width: total * scale }]} />
          {ticks.map((time) => <View key={time} pointerEvents="none" style={[S.tick, { left: width / 2 + time * scale }]}>
            <Text style={S.tickLabel}>{time < 60000 ? `${Number((time / 1000).toFixed(1))}s` : formatMixTime(time)}</Text>
            <View style={S.tickMark} />
          </View>)}
          {timeline.map((clip, index) => {
            const source = tracks.get(clip.trackId);
            const selected = clip.id === selectedId;
            const range = draft?.id === clip.id ? draft.range : [clip.sourceStartMs, clip.sourceEndMs];
            const clipWidth = Math.max(1, (range[1] - range[0]) * scale);
            const left = width / 2 + clip.startMs * scale + (range[0] - clip.sourceStartMs) * scale;
            if (!selected && (left + clipWidth < offset - width || left > offset + width * 2)) return null;
            return <View key={clip.id} style={[S.clip, { left: selected ? left - 12 : left, width: selected ? clipWidth + 24 : clipWidth }, selected && S.selected]}>
              <LoggedPressable disabled={disabled} accessibilityLabel={`Selecionar clipe ${index + 1}: ${source?.title}`}
                onPress={() => onSelect(clip)} style={[S.clipBody, selected && S.selectedBody]}>
                <Text numberOfLines={1} style={S.clipTitle}>{source?.title} <Text style={S.artist}>{source?.artistName}</Text></Text>
              </LoggedPressable>
              {selected && source && !disabled ? (['start', 'end'] as const).map((edge) => <TrimHandle key={edge} edge={edge}
                clip={clip} sourceDuration={source.duration_ms} scale={scale} onBegin={() => {
                  dragging.current = false; onScrub(); setTrimming(true);
                }} onChange={(next) => setDraft({ id: clip.id, range: next })} onEnd={(next) => {
                  setDraft(null); setTrimming(false); if (next) onTrim(clip.id, next);
                }} />) : null}
            </View>;
          })}
        </View>
      </ScrollView>
    </GestureDetector>
    <View pointerEvents="none" testID="mix-fixed-playhead" style={[S.playhead, { left: width / 2 - 1.5 }]} />
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
  artist: { fontFamily: 'SF-Regular', color: '#F8D7F5' },
  handle: { position: 'absolute', top: -2, bottom: -2, width: 14, backgroundColor: '#FFCF20', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  handleStart: { left: 0, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  handleEnd: { right: 0, borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  grip: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#151515' },
  playhead: { position: 'absolute', top: 4, height: 80, width: 3, borderRadius: 2, backgroundColor: '#FFF', zIndex: 3 },
  hint: { position: 'absolute', bottom: 4, alignSelf: 'center', color: '#9399A3', fontSize: 10 },
});
