import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import Play from 'lucide-react-native/icons/play';
import Pause from 'lucide-react-native/icons/pause';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import { SheetFrame, LoggedPressable } from '../native';
import { HeaderIconButton } from '../gym';
import { PlaylistSheetAction } from '../LocalPlaylist/PlaylistForm';
import { loadMixWaveform, waveformSlice } from '../../services/mix/mixWaveform';
import { detectMixBeats, type BeatDensity } from '../../services/mix/mixBeats';
import { formatMixTime, type mixTimeline } from '../../services/mix/mixTimeline';

type Entry = ReturnType<typeof mixTimeline>[number];
export function MixBeatSheet({ clip, duration, uri, position, playing, onSeek, onPlay, onClose, onApply }: {
  clip: Entry; duration: number; uri?: string; position: number; playing: boolean;
  onSeek: (ms: number) => void; onPlay: () => void; onClose: () => void; onApply: (beats: number[]) => void;
}) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [density, setDensity] = React.useState<BeatDensity>('off');
  const [beats, setBeats] = React.useState(clip.beatsMs || []);
  const [width, setWidth] = React.useState(320);
  const latest = React.useRef({ clip, position, width, onSeek });
  latest.current = { clip, position, width, onSeek };
  const origin = React.useRef(0);
  const scrub = React.useMemo(() => Gesture.Pan().runOnJS(true).activeOffsetX([-4, 4]).failOffsetY([-12, 12])
    .onStart(() => { origin.current = latest.current.position; })
    .onUpdate(({ translationX }) => {
      const { clip, width, onSeek } = latest.current;
      onSeek(Math.round(Math.max(clip.startMs, Math.min(clip.endMs - 1, origin.current - translationX * 8000 / width))));
    }), []);
  React.useEffect(() => {
    let active = true;
    void loadMixWaveform(uri, clip.trackId, true).then((values) => {
      if (active) setPeaks(values);
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uri, clip.trackId]);
  const sourcePosition = Math.max(clip.sourceStartMs, Math.min(clip.sourceEndMs - 1, clip.sourceStartMs + position - clip.startMs));
  const windowMs = 8000;
  const start = sourcePosition - windowMs / 2;
  const end = start + windowMs;
  const visibleStart = Math.max(0, start), visibleEnd = Math.min(duration, end);
  const values = waveformSlice(peaks, visibleStart, visibleEnd, duration, 160);
  const x = (ms: number) => (ms - start) / windowMs * 320;
  const path = values.length ? [
    `M${x(visibleStart)} 50`,
    ...values.map((v, i) => `L${x(visibleStart + (visibleEnd - visibleStart) * i / Math.max(1, values.length - 1))} ${50 - v * 44}`),
    ...values.map((v, i) => `L${x(visibleStart + (visibleEnd - visibleStart) * (values.length - 1 - i) / Math.max(1, values.length - 1))} ${50 + values[values.length - 1 - i] * 44}`), 'Z',
  ].join(' ') : '';
  const generate = (mode: BeatDensity) => { setDensity(mode); setBeats(detectMixBeats(peaks, duration, clip.sourceStartMs, clip.sourceEndMs, mode)); };
  const near = beats.find((beat) => Math.abs(beat - sourcePosition) <= 90);
  return <SheetFrame visible title="Batidas" size="sheet" centerTitle hideDefaultClose dimBackdrop={false}
    onClose={onClose} headerLeading={<HeaderIconButton icon="x" label="Cancelar batidas" onPress={onClose} />}
    headerTrailing={<PlaylistSheetAction label="Aplicar batidas" onPress={() => onApply(beats)} />}>
    <View style={S.transport}>
      <LoggedPressable accessibilityLabel={playing ? 'Pausar batidas' : 'Ouvir batidas'} onPress={onPlay}>
        {playing ? <Pause size={24} color="#FFF" /> : <Play size={24} color="#FFF" />}
      </LoggedPressable>
      <Text style={S.text}>{formatMixTime(sourcePosition - clip.sourceStartMs)} / {formatMixTime(clip.sourceEndMs - clip.sourceStartMs)}</Text>
    </View>
    <GestureDetector gesture={scrub}><View style={S.wave} collapsable={false}
      onLayout={({ nativeEvent }) => setWidth(Math.max(1, nativeEvent.layout.width))}>
      <Svg width="100%" height={110} viewBox="0 0 320 110" preserveAspectRatio="none">
        <Path d={path} fill="#626E7C" />
        {beats.filter((ms) => ms >= start && ms <= end).map((ms) => <React.Fragment key={ms}>
          <Line x1={x(ms)} y1={3} x2={x(ms)} y2={96} stroke="#BEC4CC" strokeDasharray="2 3" />
          <Circle cx={x(ms)} cy={104} r={3} fill="#FFF" />
        </React.Fragment>)}
        <Line x1={160} y1={2} x2={160} y2={96} stroke="#FFF" strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    </View></GestureDetector>
    <Slider accessibilityLabel="Posição da batida" minimumValue={clip.startMs} maximumValue={clip.endMs - 1}
      value={Math.max(clip.startMs, Math.min(clip.endMs - 1, position))} onValueChange={onSeek}
      minimumTrackTintColor="#FFCF20" maximumTrackTintColor="#545459" thumbTintColor="#FFF" />
    <LoggedPressable style={S.add} accessibilityLabel={near === undefined ? 'Adicionar batida' : 'Remover batida'}
      onPress={() => setBeats((old) => near === undefined ? [...old, Math.round(sourcePosition)].sort((a,b) => a-b).slice(0, 10000) : old.filter((ms) => ms !== near))}>
      <Text style={S.text}>{near === undefined ? 'Adicionar' : 'Remover'}</Text>
    </LoggedPressable>
    <Text style={S.secondary}>{loading ? 'Analisando áudio…' : !peaks.length ? 'Análise automática indisponível. Adicione marcações manualmente.' : 'Gerar batidas'}</Text>
    <View style={S.tabs}>
      {([['off', 'Desativado'], ['less', 'Menos'], ['more', 'Mais']] as const).map(([mode, label]) =>
        <LoggedPressable key={mode} disabled={mode !== 'off' && !peaks.length} accessibilityLabel={label} accessibilityState={{ selected: density === mode }}
          onPress={() => generate(mode)} style={[S.tab, density === mode && S.active]}>
          <Text style={[S.text, density === mode && { color: '#111' }]}>{label}</Text>
        </LoggedPressable>)}
      <LoggedPressable accessibilityLabel="Limpar batidas" onPress={() => generate('off')} style={S.tab}><RotateCcw size={20} color="#FFF" /></LoggedPressable>
    </View>
  </SheetFrame>;
}
const S = StyleSheet.create({
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wave: { backgroundColor: '#1C2025', borderRadius: 8, overflow: 'hidden' },
  text: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  secondary: { color: '#AAAEB5', fontSize: 13 },
  add: { backgroundColor: '#293034', borderRadius: 12, padding: 14, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#25292E', borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  active: { backgroundColor: '#FFF' },
});
