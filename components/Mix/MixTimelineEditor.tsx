import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import Plus from 'lucide-react-native/icons/plus';
import { LoggedPressable } from '../native';
import { formatMixTime, MAX_MIX_LANES, MAX_MIX_DURATION_MS, MIN_CLIP_MS, placeMixClip, type MixClip, mixTimeline } from '../../services/mix/mixTimeline';
import type { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import { loadMixWaveform, waveformSlice } from '../../services/mix/mixWaveform';
import { SkeletonImage } from '../common/SkeletonImage';
import { getExistingLocalCoverPath } from '../../services/download/localAudioPaths';

type Entry = ReturnType<typeof mixTimeline>[number];
type Source = ReturnType<typeof mergeMixTrack>;
const BASE_SCALE = 0.045;
const MIN_ZOOM = 0.0625 / 3;
const MAX_ZOOM = 24;
const LANE_HEIGHT = 46;
const COLORS = ['#C000A4', '#1769D1', '#16864B', '#CB3448', '#783DCC'];
export const clipColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash, 31) + id.charCodeAt(i) | 0;
  return COLORS[(hash >>> 0) % COLORS.length];
};
const STEPS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];
export const timelineScale = (zoom: number, total: number) =>
  Math.min(BASE_SCALE * Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)), 500000 / Math.max(total, 1));
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
  scrollGesture: ReturnType<typeof Gesture.Pan>;
  onBegin: () => void; onChange: (range: [number, number]) => void; onEnd: (range?: [number, number]) => void;
}) {
  const latest = React.useRef({ edge, clip, sourceDuration, scale, onBegin, onChange, onEnd });
  latest.current = { edge, clip, sourceDuration, scale, onBegin, onChange, onEnd };
  const origin = React.useRef(latest.current);
  const active = React.useRef(false);
  const fingerOrigin = React.useRef<number | undefined>(undefined);
  const lastRange = React.useRef<[number, number] | undefined>(undefined);
  const gesture = React.useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0).maxPointers(1).shouldCancelWhenOutside(false)
    .blocksExternalGesture(scrollGesture)
    .onStart((g) => { origin.current = latest.current; active.current = true; fingerOrigin.current = g.absoluteX; lastRange.current = undefined; origin.current.onBegin(); })
    .onUpdate((g) => {
      const o = origin.current;
      const dx = Number.isFinite(fingerOrigin.current) && Number.isFinite(g.absoluteX) ? g.absoluteX - fingerOrigin.current! : g.translationX;
      lastRange.current = trimAtOffset(o.clip, o.edge, dx, o.scale, o.sourceDuration);
      o.onChange(lastRange.current);
    })
    .onEnd((g, success) => {
      const o = origin.current;
      active.current = false;
      const dx = Number.isFinite(fingerOrigin.current) && Number.isFinite(g.absoluteX) ? g.absoluteX - fingerOrigin.current! : g.translationX;
      o.onEnd(success ? trimAtOffset(o.clip, o.edge, dx, o.scale, o.sourceDuration) : lastRange.current);
    })
    .onFinalize(() => { if (active.current) { active.current = false; origin.current.onEnd(lastRange.current); } }), [scrollGesture]);
  return <GestureDetector gesture={gesture}><View collapsable={false} accessibilityRole="adjustable"
    accessibilityLabel={edge === 'start' ? 'Arrastar início do clipe' : 'Arrastar fim do clipe'}
    accessibilityActions={[{ name: 'increment', label: 'Avançar 100 ms' }, { name: 'decrement', label: 'Voltar 100 ms' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      const o = latest.current;
      const delta = nativeEvent.actionName === 'increment' ? 100 : -100;
      o.onBegin(); o.onEnd(trimAtOffset(o.clip, o.edge, delta * o.scale, o.scale, o.sourceDuration));
    }}
    style={[S.handle, edge === 'start' ? S.handleStart : S.handleEnd]}><View pointerEvents="none" style={S.grip} /></View></GestureDetector>;
}

function ClipCover({ source }: { source?: Source }) {
  const fallback = source?.imageURL || '';
  const [uri, setUri] = React.useState(source?.localImagePath || fallback);
  React.useEffect(() => {
    let active = true;
    setUri(source?.localImagePath || fallback);
    void getExistingLocalCoverPath(source?.localImagePath).then((path) => {
      if (active) setUri(path || fallback);
    }).catch(() => {});
    return () => { active = false; };
  }, [source?.localImagePath, fallback]);
  return uri ? <SkeletonImage testID="mix-clip-cover" source={{ uri }} cachePolicy="memory-disk"
    onError={() => { if (uri !== fallback) setUri(fallback); }} style={S.cover} /> : null;
}

function ClipWaveform({ source, range, left, width }: { source?: Source; range: number[]; left: number; width: number }) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  React.useEffect(() => {
    let current = true;
    setPeaks([]);
    void loadMixWaveform(source?.localAudioPath, source?.spotifyId).then((values) => { if (current) setPeaks(values); }).catch(() => {});
    return () => { current = false; };
  }, [source?.localAudioPath, source?.spotifyId]);
  const values = waveformSlice(peaks, range[0], range[1], source?.duration_ms || 0, Math.ceil(width / 2));
  if (!values.length || width <= 0) return null;
  // Explicit dimensions avoid a zero-height SVG inside the horizontal scroller.
  const path = values.map((v, i) => {
    const x = i * width / Math.max(1, values.length - 1);
    return `${i ? 'L' : 'M'}${x.toFixed(2)} ${(36 - v * 33).toFixed(2)}`;
  }).join(' ');
  return <View testID="mix-clip-waveform" pointerEvents="none" style={{ position: 'absolute', top: 0, left, width, height: 38 }}><Svg width={width} height={38} viewBox={`0 0 ${width} 38`}>
    <Path d={path} fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
  </Svg></View>;
}

function MovableClip({ clip, scale, lanes, navigation, disabled, onBegin, onMove, onFinish, children }: {
  clip: Entry; scale: number; lanes: number; navigation: ReturnType<typeof Gesture.Pan>; disabled: boolean;
  onBegin: () => void; onMove: (lane: number, ms: number, fingerX: number) => void; onFinish: (lane?: number, ms?: number) => void;
  children: React.ReactNode;
}) {
  const latest = React.useRef({ clip, scale, lanes, onBegin, onMove, onFinish });
  latest.current = { clip, scale, lanes, onBegin, onMove, onFinish };
  const origin = React.useRef(latest.current);
  const finger = React.useRef({ x: 0, y: 0 });
  const target = React.useRef<{ lane: number; ms: number } | null>(null);
  const active = React.useRef(false);
  const gesture = React.useMemo(() => Gesture.Pan().runOnJS(true).enabled(!disabled).activateAfterLongPress(250)
    .maxPointers(1).shouldCancelWhenOutside(false).blocksExternalGesture(navigation)
    .onStart((event) => {
      origin.current = latest.current; finger.current = { x: event.absoluteX, y: event.absoluteY };
      active.current = true; target.current = null; origin.current.onBegin();
    })
    .onUpdate((event) => {
      if (!active.current) return;
      const o = origin.current;
      const dx = Number.isFinite(event.absoluteX - finger.current.x) ? event.absoluteX - finger.current.x : event.translationX;
      const dy = Number.isFinite(event.absoluteY - finger.current.y) ? event.absoluteY - finger.current.y : event.translationY;
      const lane = Math.max(0, Math.min(o.lanes - 1, o.clip.lane + Math.round(dy / LANE_HEIGHT)));
      const ms = Math.max(0, Math.round((o.clip.startMs + dx / o.scale) / 10) * 10);
      target.current = { lane, ms }; o.onMove(lane, ms, event.absoluteX);
    })
    .onFinalize((_event, success) => {
      if (!active.current) return;
      active.current = false;
      const t = target.current;
      origin.current.onFinish(success && t ? t.lane : undefined, success && t ? t.ms : undefined);
    }), [navigation, disabled]);
  return <GestureDetector gesture={gesture}><View collapsable={false} style={S.movableBody}
    testID={`mix-drag-${clip.id}`}>{children}</View></GestureDetector>;
}

export function MixTimelineEditor({ timeline, total, tracks, selectedId, position, disabled, onSelect, onSeek, onScrub, onTrim, onAddTrack, onTrimActive, onMoveClip, onDragSelect, onDeselect }: {
  timeline: Entry[]; total: number; tracks: Map<string, Source>; selectedId: string; position: number;
  playing: boolean; disabled: boolean; onSelect: (clip: Entry) => void; onSeek: (ms: number) => void;
  onScrub: () => void; onTrim: (id: string, range: [number, number]) => void;
  onAddTrack: (lane: number) => void;
  onTrimActive?: (active: boolean) => void;
  onMoveClip: (id: string, lane: number, ms: number) => void;
  onDragSelect: (id: string) => void;
  onDeselect: () => void;
}) {
  const [width, setWidth] = React.useState(320);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState(0);
  const [pinching, setPinching] = React.useState(false);
  const [draft, setDraft] = React.useState<{ id: string; edge: 'start' | 'end'; range: [number, number] } | null>(null);
  const [trimming, setTrimming] = React.useState(false);
  const [moving, setMoving] = React.useState<{ id: string; lane: number; ms: number } | null>(null);
  const viewport = React.useRef<View>(null);
  const viewportX = React.useRef(0);
  const dragScroll = React.useRef({ x: 0, extra: 0, finger: 0, active: false });
  const dragging = React.useRef(false);
  const pinchActive = React.useRef(false);
  const zoomOrigin = React.useRef(1);
  const trimActive = React.useRef(false);
  const scale = timelineScale(zoom, total);
  const latest = React.useRef({ zoom, onScrub, disabled, scale, onSeek, position, onDeselect });
  latest.current = { zoom, onScrub, disabled, scale, onSeek, position, onDeselect };
  const panOrigin = React.useRef(0);
  const navigate = React.useMemo(() => Gesture.Pan().runOnJS(true).maxPointers(1)
    .activeOffsetX([-8, 8]).failOffsetY([-12, 12])
    .onStart(() => {
      if (latest.current.disabled || trimActive.current || pinchActive.current) return;
      dragging.current = true;
      panOrigin.current = latest.current.position * latest.current.scale;
      latest.current.onScrub();
    })
    .onUpdate((event) => {
      if (!dragging.current || trimActive.current || pinchActive.current) return;
      const { scale, onSeek } = latest.current;
      const ms = positionAtOffset(panOrigin.current - event.translationX, scale, MAX_MIX_DURATION_MS);
      const x = ms * scale;
      setOffset(x);
      onSeek(ms);
    })
    .onFinalize(() => { dragging.current = false; }), []);
  const pinch = React.useMemo(() => Gesture.Pinch().runOnJS(true)
    .onStart(() => {
      if (latest.current.disabled || trimActive.current) return;
      pinchActive.current = true; dragging.current = false; zoomOrigin.current = latest.current.zoom;
      latest.current.onScrub(); setPinching(true);
    })
    .onUpdate((event) => {
      if (pinchActive.current) setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomOrigin.current * event.scale)));
    })
    .onFinalize(() => { pinchActive.current = false; setPinching(false); }), []);
  const gestures = React.useMemo(() => Gesture.Simultaneous(pinch, navigate), [pinch, navigate]);
  const isMoving = Boolean(moving);
  React.useEffect(() => {
    if (!isMoving) return;
    const timer = setInterval(() => {
      const drag = dragScroll.current;
      if (!drag.active) return;
      const relative = drag.finger - viewportX.current;
      const delta = relative > width - 32 ? 8 : relative < 32 ? -8 : 0;
      if (!delta) return;
      const next = Math.max(0, Math.min(MAX_MIX_DURATION_MS * scale, drag.x + delta));
      const applied = next - drag.x;
      drag.x = next; drag.extra += applied;
      setOffset(next);
      setMoving((value) => value ? { ...value, ms: Math.max(0, value.ms + applied / scale) } : value);
    }, 40);
    return () => clearInterval(timer);
  }, [isMoving, width, scale]);
  React.useEffect(() => {
    if (dragging.current || trimming) return;
    const x = Math.min(MAX_MIX_DURATION_MS, Math.max(0, position)) * scale;
    setOffset(x);
  }, [position, scale, total, trimming]);
  const step = STEPS.find((value) => value * scale >= 48) || Math.ceil(48 / scale / 3600000) * 3600000;
  const first = Math.max(0, Math.floor((offset - width) / (step * scale)));
  const last = Math.min(Math.ceil(MAX_MIX_DURATION_MS / step), Math.ceil((offset + width * 2) / (step * scale)));
  const ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * step);
  const occupiedLanes = Math.max(0, ...timeline.map((clip) => clip.lane + 1));
  const lanes = Math.min(MAX_MIX_LANES, occupiedLanes + 1);
  const laneEnds = Array.from({ length: lanes }, (_, lane) => timeline.reduce((end, clip) => clip.lane === lane ? Math.max(end, clip.endMs) : end, 0));
  const moved = moving ? mixTimeline(placeMixClip(timeline, moving.id, moving.lane, moving.ms)) : null;
  const displayed = moved ? timeline.map((clip) => moved.find((item) => item.id === clip.id) || clip) : draft?.edge === 'end' ? mixTimeline(timeline.map((clip) => clip.id === draft.id
    ? { ...clip, sourceStartMs: draft.range[0], sourceEndMs: draft.range[1] } : clip)) : timeline;
  const height = 66 + lanes * 46;
  return <View ref={viewport} testID="mix-timeline-viewport" onLayout={({ nativeEvent }) => {
    setWidth(Math.max(1, nativeEvent.layout.width)); viewport.current?.measureInWindow((x) => { viewportX.current = x; });
  }} style={[S.viewport, { height }]}>
    <GestureDetector gesture={gestures}>
      <View testID="mix-timeline-scroll" style={{ flex: 1 }} collapsable={false}>
        <View accessibilityLabel="Timeline do mix" style={[S.content, { height: height - 22, width }]}>
          <LoggedPressable accessibilityLabel="Desmarcar clipe" testID="mix-timeline-background" onPress={onDeselect} style={StyleSheet.absoluteFill} />
          {laneEnds.map((_, lane) => <View key={lane} pointerEvents="none" style={[S.lane, { top: 36 + lane * 46, left: Math.max(0, width / 2 - offset), right: 0 }]} />)}
          {ticks.map((time) => <View key={time} pointerEvents="none" style={[S.tick, { left: width / 2 + time * scale - offset }]}>
            <Text style={S.tickLabel}>{time < 60000 ? `${Number((time / 1000).toFixed(1))}s` : formatMixTime(time)}</Text>
            <View style={S.tickMark} />
          </View>)}
          {displayed.map((clip, index) => {
            const original = timeline[index];
            const source = tracks.get(clip.trackId);
            const selected = clip.id === selectedId;
            const range = draft?.id === clip.id ? draft.range : [clip.sourceStartMs, clip.sourceEndMs];
            const clipWidth = Math.max(1, (range[1] - range[0]) * scale);
            const left = width / 2 + clip.startMs * scale - offset + (draft?.id === clip.id && draft.edge === 'start'
              ? (range[0] - original.sourceStartMs) * scale : 0);
            if (!selected && (left + clipWidth < -width || left > width * 2)) return null;
            const visibleStart = Math.max(0, Math.min(clipWidth, -left));
            const visibleEnd = Math.max(visibleStart, Math.min(clipWidth, width - left));
            return <View key={clip.id} testID={`mix-clip-${clip.id}`} style={[S.clip, { top: 36 + clip.lane * LANE_HEIGHT - (selected ? 2 : 0), left: selected ? left - 18 : left, width: selected ? clipWidth + 36 : clipWidth }, selected && S.selected, moving?.id === clip.id && S.moving]}>
              <MovableClip clip={original} scale={scale} lanes={lanes} navigation={navigate} disabled={disabled}
                onBegin={() => {
                  trimActive.current = true; dragging.current = false; onScrub(); onDragSelect(clip.id);
                  dragScroll.current = { x: offset, extra: 0, finger: width / 2 + viewportX.current, active: true };
                  setTrimming(true); onTrimActive?.(true);
                }}
                onMove={(lane, ms, finger) => {
                  dragScroll.current.finger = finger;
                  setMoving({ id: clip.id, lane, ms: Math.max(0, ms + dragScroll.current.extra / scale) });
                }}
                onFinish={(lane, ms) => {
                  const drag = dragScroll.current;
                  drag.active = false;
                  if (lane !== undefined && ms !== undefined) onMoveClip(clip.id, lane, Math.max(0, ms + drag.extra / scale));
                  if (drag.extra) onSeek(positionAtOffset(drag.x, scale, MAX_MIX_DURATION_MS));
                  setMoving(null); trimActive.current = false; setTrimming(false); onTrimActive?.(false);
                }}>
              <LoggedPressable disabled={disabled} accessibilityLabel={`Selecionar clipe ${index + 1}: ${source?.title}`}
                onPress={() => onSelect(original)} style={[S.clipBody, { backgroundColor: clipColor(clip.trackId) }, selected && S.selectedBody]}>
                <ClipWaveform source={source} range={[range[0] + visibleStart / scale, Math.min(range[1], range[0] + visibleEnd / scale)]}
                  left={visibleStart} width={visibleEnd - visibleStart} />
                <View pointerEvents="none" style={[S.clipInfo, { left: visibleStart, maxWidth: Math.max(0, visibleEnd - visibleStart) }]}>
                <ClipCover source={source} />
                <View style={S.clipText}>
                  <Text numberOfLines={1} style={S.clipTitle}>{source?.title}{source?.explicit ? ' ▪ E' : ''}</Text>
                  <Text numberOfLines={1} style={S.clipTime}>{source?.artistName} • {formatMixTime(range[1] - range[0])}</Text>
                </View>
                </View>
              </LoggedPressable>
              </MovableClip>
              {selected && source && !disabled && !moving ? (['start', 'end'] as const).map((edge) => <TrimHandle key={edge} edge={edge}
                clip={original} sourceDuration={source.duration_ms} scale={scale} scrollGesture={navigate} onBegin={() => {
                  trimActive.current = true; dragging.current = false; onScrub(); setTrimming(true); onTrimActive?.(true);
                }} onChange={(next) => setDraft({ id: clip.id, edge, range: next })} onEnd={(next) => {
                  if (next) onTrim(clip.id, next);
                  trimActive.current = false; setDraft(null); setTrimming(false); onTrimActive?.(false);
                }} />) : null}
            </View>;
          })}
          {laneEnds.map((end, lane) => <LoggedPressable key={lane} disabled={disabled || trimming || pinching}
            accessibilityLabel={`Adicionar música à faixa ${lane + 1}`} onPress={() => onAddTrack(lane)}
            style={[S.add, { top: 43 + lane * 46, left: width / 2 + (lane === occupiedLanes ? 0 : end * scale - offset) + 20 }]}><Plus size={20} color="#171717" /></LoggedPressable>)}
        </View>
      </View>
    </GestureDetector>
    <View pointerEvents="none" testID="mix-fixed-playhead" style={[S.playhead, { left: width / 2 - 1.5, height: height - 26 }]} />
  </View>;
}

const S = StyleSheet.create({
  viewport: { height: 108, backgroundColor: '#101418', borderRadius: 12, overflow: 'hidden' },
  content: { height: 86 },
  lane: { position: 'absolute', top: 36, height: 42, backgroundColor: '#20242A' },
  tick: { position: 'absolute', top: 5, alignItems: 'flex-start' },
  tickLabel: { color: '#A5ABB4', fontSize: 11, fontVariant: ['tabular-nums'] },
  tickMark: { width: 2, height: 7, borderRadius: 1, backgroundColor: '#626A74', marginTop: 3 },
  clip: { position: 'absolute', top: 36, height: 42, borderRadius: 6 },
  selected: { height: 46, borderRadius: 9, backgroundColor: '#FFCF20', zIndex: 2 },
  moving: { opacity: 0.82, zIndex: 5, elevation: 6 },
  movableBody: { flex: 1, minWidth: 0 },
  clipBody: { flex: 1, minWidth: 0, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4, overflow: 'hidden' },
  clipInfo: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  selectedBody: { marginHorizontal: 18, marginVertical: 2 },
  cover: { width: 30, height: 30, borderRadius: 4 },
  clipText: { flex: 1, minWidth: 0 },
  clipTitle: { color: '#FFF', fontSize: 12, fontFamily: 'SF-Semibold' },
  clipTime: { color: '#FFF', fontSize: 10, fontVariant: ['tabular-nums'] },
  add: { position: 'absolute', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 18, backgroundColor: '#FFCF20', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  handleStart: { left: 0, borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  handleEnd: { right: 0, borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  grip: { width: 3, height: 18, borderRadius: 2, backgroundColor: '#151515' },
  playhead: { position: 'absolute', top: 4, height: 80, width: 3, borderRadius: 2, backgroundColor: '#FFF', zIndex: 3 },
});
