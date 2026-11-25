import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { loadMixWaveform } from '../../services/mix/mixWaveform';
import { clipDuration, slipSourceStart, type MixClip } from '../../services/mix/mixTimeline';
import { MixWaveTiles } from './MixWaveTiles';

/** A fixed timeline window over a moving, full-source waveform. */
export function MixSlipLane({ clip, sourceDuration, uri, sourceStart, scale, left, top, width, onChange, onBegin, onEnd }: {
  clip: MixClip; sourceDuration: number; uri?: string; sourceStart: number; scale: number;
  left: number; top: number; width: number; onChange: (ms: number) => void; onBegin: () => void; onEnd: () => void;
}) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  React.useEffect(() => {
    let active = true;
    void loadMixWaveform(uri, clip.trackId).then((values) => { if (active) setPeaks(values); }).catch(() => {});
    return () => { active = false; };
  }, [uri, clip.trackId]);
  const latest = React.useRef({ clip, sourceDuration, sourceStart, scale, onChange, onBegin, onEnd });
  latest.current = { clip, sourceDuration, sourceStart, scale, onChange, onBegin, onEnd };
  const origin = React.useRef({ start: 0, scale: 1 });
  const gesture = React.useMemo(() => Gesture.Pan().runOnJS(true).minDistance(2).maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      origin.current = { start: latest.current.sourceStart, scale: latest.current.scale };
      latest.current.onBegin();
    }).onUpdate(({ translationX }) => {
      const current = latest.current;
      current.onChange(slipSourceStart(current.clip, origin.current.start - translationX / origin.current.scale, current.sourceDuration));
    }).onFinalize(() => latest.current.onEnd()), []);
  const clipWidth = clipDuration(clip) * scale;
  const fullWidth = sourceDuration * scale;
  const waveLeft = left - sourceStart * scale;
  const visibleStart = Math.max(0, -waveLeft);
  const visibleEnd = Math.min(fullWidth, width - waveLeft);
  const windowLeft = Math.max(0, left);
  const windowRight = Math.min(width, left + clipWidth);
  const windowWidth = Math.max(0, windowRight - windowLeft);
  const wave = (color: string) => <MixWaveTiles peaks={peaks} duration={sourceDuration} sourceStart={0}
    sourceEnd={sourceDuration} scale={scale} visibleStart={visibleStart} visibleEnd={visibleEnd} height={42} color={color} />;
  return <GestureDetector gesture={gesture}>
    <View testID="mix-slip-lane" accessible accessibilityLabel="Deslizar trecho de áudio" accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: Math.max(0, sourceDuration - clipDuration(clip)), now: sourceStart }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => onChange(slipSourceStart(clip, sourceStart + (nativeEvent.actionName === 'increment' ? 1000 : -1000), sourceDuration))}
      collapsable={false} style={[S.lane, { top, width }]}>
      <View pointerEvents="none" style={{ position: 'absolute', left: waveLeft, width: fullWidth, height: 42 }}>{wave('#656970')}</View>
      {windowWidth > 0 ? <View pointerEvents="none" testID="mix-slip-window" style={[S.window, { left: windowLeft, width: windowWidth }]}>
        <View style={{ position: 'absolute', left: waveLeft - windowLeft, width: fullWidth, height: 42 }}>{wave('#FFFFFF')}</View>
      </View> : null}
      {windowWidth > 0 ? <View pointerEvents="none" style={[S.outline, { left: windowLeft, width: windowWidth }]} /> : null}
    </View>
  </GestureDetector>;
}
const S = StyleSheet.create({
  lane: { position: 'absolute', left: 0, height: 42, backgroundColor: '#0D1117', overflow: 'hidden', zIndex: 5 },
  window: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#24282E', borderRadius: 6, overflow: 'hidden' },
  outline: { position: 'absolute', top: 0, bottom: 0, borderColor: '#FFCF20', borderWidth: 2, borderRadius: 6 },
});
