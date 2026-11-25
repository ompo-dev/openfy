import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Plus from 'lucide-react-native/icons/plus';
import Volume2 from 'lucide-react-native/icons/volume-2';
import VolumeX from 'lucide-react-native/icons/volume-x';
import { LinearGradient } from 'expo-linear-gradient';
import { LoggedPressable } from '../native';
import { formatMixTime, MAX_MIX_LANES, MAX_MIX_DURATION_MS, MIN_CLIP_MS, moveMixGroup, placeMixClip, snapMixPosition, trimMixGroup, trimMixClipAtPosition, type MixClip, mixTimeline } from '../../services/mix/mixTimeline';
import type { mergeMixTrack } from '../../services/mix/mixTrackMetadata';
import { loadMixWaveform } from '../../services/mix/mixWaveform';
import { darkenWaveColor, visibleBeatMarkers } from '../../services/mix/mixWaveformGeometry';
import { MixWaveTiles } from './MixWaveTiles';
import { MixSlipLane } from './MixSlipLane';
import { SkeletonImage } from '../common/SkeletonImage';
import { getExistingLocalCoverPath } from '../../services/download/localAudioPaths';

type Entry = ReturnType<typeof mixTimeline>[number];
type Source = ReturnType<typeof mergeMixTrack>;
const BASE_SCALE = 0.045;
export const INITIAL_MIX_ZOOM = 0.2;
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

function ClipWaveform({ source, range, left, width, scale, color, fadeIn, fadeOut }: { source?: Source; range: number[]; left: number; width: number; scale: number; color: string; fadeIn?: number; fadeOut?: number }) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  React.useEffect(() => {
    let current = true;
    void loadMixWaveform(source?.localAudioPath, source?.spotifyId).then((values) => { if (current) setPeaks(values); }).catch(() => {});
    return () => { current = false; };
  }, [source?.localAudioPath, source?.spotifyId]);
  if ((!peaks.length && !fadeIn && !fadeOut) || width <= 0) return null;
  return <MixWaveTiles peaks={peaks} duration={source?.duration_ms || 0} sourceStart={range[0]} sourceEnd={range[1]}
    scale={scale} visibleStart={left} visibleEnd={left + width} height={42} color={darkenWaveColor(color)} fadeIn={fadeIn} fadeOut={fadeOut} />;
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
  const gesture = React.useMemo(() => Gesture.Pan().runOnJS(true).enabled(!disabled).minDistance(3)
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

export function MixTimelineEditor({ timeline, total, tracks, selectedId, selectedIds, position, disabled, onSelect, onSeek, onScrub, onTrim, onAddTrack, onTrimActive, onMoveClip, onDragSelect, onDeselect, slip, mutedLanes, onToggleLaneMute }: {
  timeline: Entry[]; total: number; tracks: Map<string, Source>; selectedId: string; position: number;
  selectedIds?: ReadonlySet<string>;
  mutedLanes?: ReadonlySet<number>;
  onToggleLaneMute?: (lane: number) => void;
  playing: boolean; disabled: boolean; onSelect: (clip: Entry) => void; onSeek: (ms: number) => void;
  onScrub: () => void; onTrim: (id: string, range: [number, number]) => void;
  onAddTrack: (lane: number) => void;
  onTrimActive?: (active: boolean) => void;
  onMoveClip: (id: string, lane: number, ms: number) => void;
  onDragSelect: (id: string) => void;
  onDeselect: () => void;
  slip?: { id: string; sourceStart: number; onChange: (ms: number) => void };
}) {
  const [width, setWidth] = React.useState(320);
  const [zoom, setZoom] = React.useState(INITIAL_MIX_ZOOM);
  const [offset, setOffset] = React.useState(0);
  const [pinching, setPinching] = React.useState(false);
  const [draft, setDraft] = React.useState<{ id: string; edge: 'start' | 'end'; range: [number, number] } | null>(null);
  const [trimming, setTrimming] = React.useState(false);
  const [moving, setMoving] = React.useState<{ id: string; lane: number; ms: number } | null>(null);
  const [guide, setGuide] = React.useState<number | null>(null);
  const viewport = React.useRef<View>(null);
  const viewportX = React.useRef(0);
  const dragScroll = React.useRef({ x: 0, extra: 0, finger: 0, active: false });
  const dragging = React.useRef(false);
  const pinchActive = React.useRef(false);
  const zoomOrigin = React.useRef(INITIAL_MIX_ZOOM);
  const trimActive = React.useRef(false);
  const scale = timelineScale(zoom, total);
  const latest = React.useRef({ zoom, onScrub, disabled: disabled || !!slip, scale, onSeek, position, onDeselect });
  latest.current = { zoom, onScrub, disabled: disabled || !!slip, scale, onSeek, position, onDeselect };
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
  const divisions = step * scale >= 64 ? 8 : 4;
  const minorStep = step / divisions;
  const first = Math.max(0, Math.floor((offset - width / 2) / (minorStep * scale)));
  const last = Math.min(Math.floor(MAX_MIX_DURATION_MS / minorStep), Math.ceil((offset + width / 2) / (minorStep * scale)));
  const ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => ({
    time: (first + i) * minorStep, major: (first + i) % divisions === 0, middle: (first + i) % (divisions / 2) === 0,
  }));
  const occupiedLanes = Math.max(0, ...timeline.map((clip) => clip.lane + 1));
  const lanes = Math.min(MAX_MIX_LANES, occupiedLanes + 1);
  const laneEnds = Array.from({ length: lanes }, (_, lane) => timeline.reduce((end, clip) => clip.lane === lane ? Math.max(end, clip.endMs) : end, 0));
  const snap = (id: string, ms: number) => snapMixPosition(selectedIds?.has(id) && selectedIds.size > 1
    ? timeline.filter((clip) => clip.id === id || !selectedIds.has(clip.id)) : timeline, id, ms,
    dragScroll.current.active ? dragScroll.current.x / scale : position, scale);
  const grouped = (selectedIds?.size ?? 0) > 1;
  const moved = moving ? mixTimeline(grouped && selectedIds?.has(moving.id)
    ? moveMixGroup(timeline, selectedIds, moving.id, moving.lane, snap(moving.id, moving.ms).ms)
    : placeMixClip(timeline, moving.id, moving.lane, snap(moving.id, moving.ms).ms)) : null;
  const snapped = moving ? snap(moving.id, moving.ms) : null;
  const activeGuide = moving ? (moved?.find((clip) => clip.id === moving.id)?.startMs === Math.round(snapped!.ms) ? snapped!.guide : null) : guide;
  const snapTrim = (clip: Entry, edge: 'start' | 'end', range: [number, number], duration: number): [number, number] => {
    const boundary = edge === 'start' ? clip.startMs + range[0] - clip.sourceStartMs : clip.endMs + range[1] - clip.sourceEndMs;
    const aligned = snapMixPosition(timeline, clip.id, boundary, position, scale, edge);
    const next = [...range] as [number, number];
    const index = edge === 'start' ? 0 : 1;
    next[index] += aligned.ms - boundary;
    if (next[0] < 0 || next[1] > duration || next[1] - next[0] < MIN_CLIP_MS) { setGuide(null); return range; }
    setGuide(aligned.guide); return next;
  };
  const displayed = moved ? timeline.map((clip) => moved.find((item) => item.id === clip.id) || clip) :
    draft ? mixTimeline(grouped && selectedIds?.has(draft.id) ? trimMixGroup(timeline, selectedIds, draft.id, draft.range, (id) => tracks.get(id)?.duration_ms ?? NaN)
      : trimMixClipAtPosition(timeline, draft.id, draft.range[0], draft.range[1])) : timeline;
  const height = 44 + lanes * 46;
  const slipClip = slip ? timeline.find((clip) => clip.id === slip.id) : undefined;
  const slipSource = slipClip ? tracks.get(slipClip.trackId) : undefined;
  return <View ref={viewport} testID="mix-timeline-viewport" onLayout={({ nativeEvent }) => {
    setWidth(Math.max(1, nativeEvent.layout.width)); viewport.current?.measureInWindow((x) => { viewportX.current = x; });
  }} style={[S.viewport, { height }]}>
    <GestureDetector gesture={gestures}>
      <View testID="mix-timeline-scroll" pointerEvents={slip ? 'none' : 'auto'} style={{ flex: 1, opacity: slip ? 0.35 : 1 }} collapsable={false}>
        <View accessibilityLabel="Timeline do mix" style={[S.content, { height, width }]}>
          <LoggedPressable accessibilityLabel="Desmarcar clipe" testID="mix-timeline-background" onPress={onDeselect} style={StyleSheet.absoluteFill} />
          {laneEnds.map((_, lane) => <View key={lane} testID={`mix-lane-${lane}`} pointerEvents="none" style={[S.lane, { top: 36 + lane * 46, left: 0, right: 0 }, mutedLanes?.has(lane) && S.mutedLane]} />)}
          {ticks.map(({ time, major, middle }) => <View key={time} pointerEvents="none" style={[S.tick, { left: width / 2 + time * scale - offset - 23 }]}>
            {major ? <Text style={S.tickLabel}>{time < 60000 ? `${Number((time / 1000).toFixed(1))}s` : formatMixTime(time)}</Text> : null}
            <View style={[S.tickMark, major ? S.majorTick : middle ? S.middleTick : S.minorTick]} />
          </View>)}
          {displayed.map((clip, index) => {
            const original = timeline[index];
            const source = tracks.get(clip.trackId);
            const selected = selectedIds ? selectedIds.has(clip.id) : clip.id === selectedId;
            const handles = selected && (!grouped || clip.id === selectedId);
            const range = draft?.id === clip.id && !grouped ? draft.range : [clip.sourceStartMs, clip.sourceEndMs];
            const clipWidth = Math.max(1, (range[1] - range[0]) * scale);
            const left = width / 2 + clip.startMs * scale - offset;
            if (!selected && (left + clipWidth < -width || left > width * 2)) return null;
            const visibleStart = Math.max(0, Math.min(clipWidth, -left));
            const visibleEnd = Math.max(visibleStart, Math.min(clipWidth, width - left));
            return <View key={clip.id} testID={`mix-clip-${clip.id}`} style={[S.clip, { top: 36 + clip.lane * LANE_HEIGHT - (selected ? 2 : 0), left: handles ? left - 18 : selected ? left - 2 : left, width: handles ? clipWidth + 36 : selected ? clipWidth + 4 : clipWidth }, selected && S.selected, (moving?.id === clip.id || !!moving && grouped && selected) && S.moving]}>
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
                  if (lane !== undefined && ms !== undefined) onMoveClip(clip.id, lane, snap(clip.id, Math.max(0, ms + drag.extra / scale)).ms);
                  drag.active = false;
                  if (drag.extra) onSeek(positionAtOffset(drag.x, scale, MAX_MIX_DURATION_MS));
                  setMoving(null); trimActive.current = false; setTrimming(false); onTrimActive?.(false);
                }}>
              <LoggedPressable disabled={disabled} accessibilityLabel={`Selecionar clipe ${index + 1}: ${source?.title}`} accessibilityState={{ selected }}
                onPress={() => onSelect(original)} style={[S.clipBody, { backgroundColor: clipColor(clip.trackId) }, handles ? S.selectedBody : selected && { margin: 2 }, mutedLanes?.has(clip.lane) && S.mutedClip]}>
                <ClipWaveform source={source} range={range} scale={scale} color={clipColor(clip.trackId)}
                  fadeIn={clip.fadeInMs} fadeOut={clip.fadeOutMs} left={visibleStart} width={visibleEnd - visibleStart} />
                {clip.beatsMs && visibleBeatMarkers(clip.beatsMs, range[0], range[1], scale, visibleStart, visibleEnd)
                  .map((beat) => <View key={beat} testID={`mix-beat-${clip.id}-${beat}`} pointerEvents="none" style={[S.beat, { left: (beat - range[0]) * scale - 2,
                    backgroundColor: position >= clip.startMs + beat - range[0] ? '#FFCF20' : '#FFFFFF' }]} />)}
                <View pointerEvents="none" style={[S.clipInfo, { left: visibleStart, maxWidth: Math.max(0, visibleEnd - visibleStart) }]}>
                <ClipCover source={source} />
                <View style={S.clipText}>
                  <Text numberOfLines={1} style={S.clipTitle}>{source?.title}{source?.explicit ? ' ▪ E' : ''}</Text>
                  <Text numberOfLines={1} style={S.clipTime}>{source?.artistName} • {formatMixTime(range[1] - range[0])}</Text>
                </View>
                </View>
              </LoggedPressable>
              </MovableClip>
              {handles && source && !disabled && !moving ? (['start', 'end'] as const).map((edge) => <TrimHandle key={edge} edge={edge}
                clip={original} sourceDuration={source.duration_ms} scale={scale} scrollGesture={navigate} onBegin={() => {
                  trimActive.current = true; dragging.current = false; onScrub(); setTrimming(true); onTrimActive?.(true);
                }} onChange={(next) => setDraft({ id: clip.id, edge, range: snapTrim(original, edge, next, source.duration_ms) })} onEnd={(next) => {
                  if (next) onTrim(clip.id, snapTrim(original, edge, next, source.duration_ms));
                  setGuide(null);
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
    {onToggleLaneMute ? laneEnds.map((_, lane) => {
      const muted = !!mutedLanes?.has(lane);
      return lane < occupiedLanes ? <LoggedPressable key={lane} testID={`mix-lane-mute-${lane}`}
        accessibilityRole="button" accessibilityState={{ selected: muted }} accessibilityLabel={`${muted ? 'Ativar' : 'Mutar'} faixa ${lane + 1}`}
        disabled={disabled || !!slip} onPress={() => onToggleLaneMute(lane)}
        style={[S.laneMute, { top: 36 + lane * LANE_HEIGHT }, muted && S.mutedLane]}>
        {muted ? <VolumeX size={20} color="#FFCF20" /> : <Volume2 size={20} color="#A0A8B4" />}
      </LoggedPressable> : null;
    }) : null}
    {slip && slipClip && slipSource ? <MixSlipLane key={slipClip.id} clip={slipClip} sourceDuration={slipSource.duration_ms}
      uri={slipSource.localAudioPath} sourceStart={slip.sourceStart} scale={scale}
      left={width / 2 + slipClip.startMs * scale - offset} top={36 + slipClip.lane * LANE_HEIGHT} width={width}
      onChange={slip.onChange} onBegin={() => { onScrub(); onTrimActive?.(true); }} onEnd={() => onTrimActive?.(false)} /> : null}
    <View pointerEvents="none" testID="mix-transport-time" style={[S.timeOverlay, { maxWidth: Math.max(0, width / 2 - 4) }]}>
      <LinearGradient colors={['#0D1117', '#0D1117', '#0D111700']} locations={[0, 0.8, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={S.clock}>{formatMixTime(position)}<Text style={S.clockTotal}> / {formatMixTime(total)}</Text></Text>
    </View>
    {activeGuide !== null ? <View pointerEvents="none" testID="mix-snap-guide" style={[S.guide, { left: width / 2 + activeGuide * scale - offset, height: height - 4 }]} /> : null}
    <View pointerEvents="none" testID="mix-fixed-playhead" style={[S.playhead, { left: width / 2 - 1.5, height: height - 4, zIndex: slip ? 6 : 3 }]} />
  </View>;
}

const S = StyleSheet.create({
  viewport: { height: 108, backgroundColor: '#0D1117', overflow: 'hidden' },
  content: { height: 86 },
  lane: { position: 'absolute', top: 36, height: 42, backgroundColor: '#20242A' },
  laneMute: { position: 'absolute', left: 0, width: 40, height: 42, backgroundColor: '#20242A', alignItems: 'center', justifyContent: 'center', zIndex: 7 },
  mutedLane: { backgroundColor: '#191D23' },
  mutedClip: { opacity: 0.48 },
  tick: { position: 'absolute', top: 0, width: 46, height: 28, alignItems: 'center', justifyContent: 'flex-end' },
  tickLabel: { color: '#7C8795', fontSize: 11, fontVariant: ['tabular-nums'], position: 'absolute', top: 0 },
  tickMark: { width: 2, borderRadius: 1, backgroundColor: '#303843' },
  majorTick: { height: 5, backgroundColor: '#56606D' },
  middleTick: { height: 13 },
  minorTick: { height: 8 },
  timeOverlay: { position: 'absolute', top: 0, left: 0, height: 30, width: 115, justifyContent: 'center', paddingLeft: 8, paddingRight: 10, zIndex: 2 },
  clock: { color: '#FFF', fontSize: 12, fontFamily: 'SF-Semibold', fontVariant: ['tabular-nums'] },
  clockTotal: { color: '#8E98A5', fontFamily: 'SF-Regular' },
  clip: { position: 'absolute', top: 36, height: 42, borderRadius: 6 },
  selected: { height: 46, borderRadius: 9, backgroundColor: '#FFCF20', zIndex: 2 },
  beat: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2 },
  guide: { position: 'absolute', top: 4, width: 1, backgroundColor: '#FFCF20', zIndex: 6 },
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
