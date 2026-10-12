import * as React from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SheetFrame, NativeIconButton } from '../native';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { getAudioCapabilities } from '../../services/audio/playerService';
import { EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS, equalizerFilters, equalizerHeadroomDb } from '../../services/audio/equalizer';
import type { AppSettings } from '../../services/settings/appSettings';
import { log } from '../../utils/appLogger';
import { NativeSegmented, Section, SettingsRow, Toggle, ValueTrailing, OptionMenu } from '../gym';
import { SettingIcon } from '../gym/SettingIcon';

const NumericSlider = ({ label, value, min, max, step, disabled, onChange, suffix = '' }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  disabled?: boolean; onChange: (value: number) => void;
}) => {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return <View style={styles.sliderRow}>
    <View style={styles.readout}><Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{Number(draft.toFixed(2))}{suffix}</Text></View>
    <Slider accessibilityLabel={label} accessibilityValue={{ min, max, now: draft }} disabled={disabled}
      style={styles.slider} minimumValue={min} maximumValue={max} step={step} value={draft}
      minimumTrackTintColor="#1DB954" maximumTrackTintColor="#55555B" thumbTintColor="#FFFFFF"
      onValueChange={setDraft} onSlidingComplete={onChange} />
  </View>;
};

const TonePad = ({ x, y, disabled, onChange }: { x: number; y: number; disabled: boolean;
  onChange: (x: number, y: number) => void }) => {
  const [draft, setDraft] = React.useState({ x, y });
  const draftRef = React.useRef(draft);
  const bounds = React.useRef({ width: 1, height: 1 });
  React.useEffect(() => { draftRef.current = { x, y }; setDraft({ x, y }); }, [x, y]);
  const move = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    const next = { x: Math.round(Math.max(-5, Math.min(5, locationX / bounds.current.width * 10 - 5))),
      y: Math.round(Math.max(-5, Math.min(5, 5 - locationY / bounds.current.height * 10))) };
    draftRef.current = next; setDraft(next);
  };
  const responder = PanResponder.create({ onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled, onPanResponderGrant: move, onPanResponderMove: move,
    onPanResponderRelease: () => onChange(draftRef.current.x, draftRef.current.y),
    onPanResponderTerminationRequest: () => false });
  return <View style={[styles.pad, disabled && styles.disabled]} {...responder.panHandlers}
    onLayout={(event) => { bounds.current = event.nativeEvent.layout; }}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 11 }, (_, row) => <View key={row} style={styles.dotRow}>
        {Array.from({ length: 11 }, (_, col) => <View key={col} style={styles.dot} />)}</View>)}
      <View style={[styles.puck, { left: `${(draft.x + 5) * 10}%`, top: `${(5 - draft.y) * 10}%` }]} />
    </View>
  </View>;
};

export const AudioSettingsSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { settings, setSetting } = useAppSettingsStore();
  const capabilities = getAudioCapabilities();
  const [error, setError] = React.useState('');
  const [presets, setPresets] = React.useState(false);
  React.useEffect(() => {
    if (!visible) return;
    log.ui('audio settings sheet opened', { capabilities: getAudioCapabilities() });
    return () => log.ui('audio settings sheet closed');
  }, [visible]);
  const change = <K extends keyof AppSettings>(key: K, value: AppSettings[K] | ((current: AppSettings[K]) => AppSettings[K])) => {
    setError(''); void setSetting(key, value).catch((reason) => setError(String(reason)));
  };
  const unavailable = !capabilities.equalizer;
  const inactive = unavailable || !settings.equalizerEnabled;
  return <SheetFrame visible={visible} size="full" title="Audio e equalizador" onClose={onClose}
    overlay={<OptionMenu visible={presets} anchor={null} selectedValue={Object.entries(EQUALIZER_PRESETS).find(([, bands]) =>
      bands.every((gain, i) => gain === settings.equalizerBands[i]))?.[0] || ''}
      options={Object.keys(EQUALIZER_PRESETS).map((name) => ({ label: name, value: name }))}
      onClose={() => setPresets(false)} onSelect={(name) => {
        const bands = EQUALIZER_PRESETS[name as keyof typeof EQUALIZER_PRESETS];
        if (bands) { log.ui('equalizer preset selected', { preset: name }); change('equalizerBands', bands); }
        setPresets(false);
      }} />}
    headerTrailing={<NativeIconButton label="Zerar equalizador" systemImage="arrow.counterclockwise" iconName="refresh"
      onPress={() => { change('equalizerBands', [0, 0, 0, 0, 0, 0, 0]);
        change('equalizerToneX', 0); change('equalizerToneY', 0); change('audioBalance', 0); }} />}>
    <NumericSlider label="Velocidade" value={settings.playbackSpeed} min={0.5} max={2} step={0.05} suffix="x"
      disabled={!capabilities.speed} onChange={(value) => change('playbackSpeed', value)} />
    <NumericSlider label="Alcance do pre-carregamento" value={settings.preloadRadius} min={1} max={3} step={1}
      disabled={!settings.preloadNextTrack} onChange={(value) => change('preloadRadius', value)} />
    <Section label="Equalizador">
    <SettingsRow title="Equalizador" leading={<SettingIcon name="options" />} trailing={<View pointerEvents={unavailable ? 'none' : 'auto'} style={unavailable ? styles.disabled : undefined}>
      <Toggle label="Equalizador" disabled={unavailable} value={settings.equalizerEnabled} onValueChange={(value) => change('equalizerEnabled', value)} /></View>} />
    </Section>
    {unavailable ? <Text style={styles.error}>Instale o novo build nativo para usar equalizador e balanceamento.</Text> : null}
    <View pointerEvents={inactive ? 'none' : 'auto'} style={inactive ? styles.disabled : undefined}>
      <NativeSegmented accessibilityLabel="Modo do equalizador" disabled={inactive} value={settings.equalizerMode}
        options={[{ value: 'manual', label: 'Manual' }, { value: 'tone', label: 'Tonal' }]}
        onChange={(mode) => change('equalizerMode', mode)} />
    </View>
    {settings.equalizerMode === 'manual' ? <>
      <Section label="Preset">
      <SettingsRow title="Preset" leading={<SettingIcon name="musical-notes" />} disabled={inactive}
        onPress={() => { log.ui('equalizer presets toggled', { visible: !presets }); setPresets(!presets); }}
        trailing={<ValueTrailing label={Object.entries(EQUALIZER_PRESETS).find(([, bands]) =>
          bands.every((gain, i) => gain === settings.equalizerBands[i]))?.[0] || 'Personalizado'} />} />
      </Section>
      {EQUALIZER_FREQUENCIES.map((frequency, index) => <NumericSlider key={frequency}
        label={frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`}
        value={settings.equalizerBands[index]} min={-12} max={12} step={0.5} suffix=" dB" disabled={inactive}
        onChange={(gain) => change('equalizerBands', (bands) => bands.map((value, i) => index === i ? gain : value))} />)}
    </> : <>
      <View style={styles.row}><Text style={styles.value}>Quente</Text><Text style={styles.value}>Brilhante</Text></View>
      <Text style={styles.axis}>Medios +</Text>
      <TonePad x={settings.equalizerToneX} y={settings.equalizerToneY} disabled={inactive}
        onChange={(x, y) => { change('equalizerToneX', x); change('equalizerToneY', y); }} />
      <Text style={styles.axis}>Medios -</Text>
      <NumericSlider label="Tonalidade" value={settings.equalizerToneX} min={-5} max={5} step={1} disabled={inactive}
        onChange={(value) => change('equalizerToneX', value)} />
      <NumericSlider label="Medios" value={settings.equalizerToneY} min={-5} max={5} step={1} disabled={inactive}
        onChange={(value) => change('equalizerToneY', value)} />
      <Section label="Tonalidade"><SettingsRow title="Foco nos medios" leading={<SettingIcon name="pulse" />}
        trailing={<View pointerEvents={inactive ? 'none' : 'auto'} style={inactive ? styles.disabled : undefined}>
          <Toggle label="Foco nos medios" disabled={inactive} value={settings.equalizerFocused}
            onValueChange={(value) => change('equalizerFocused', value)} /></View>} /></Section>
    </>}
    <View style={styles.row}><Text style={styles.label}>Compensacao de ganho</Text>
      <Text style={styles.value}>{equalizerHeadroomDb(equalizerFilters(settings)).toFixed(1)} dB</Text></View>
    <NumericSlider label="Balanco L / R" value={settings.audioBalance} min={-1} max={1} step={0.05}
      disabled={unavailable} onChange={(value) => change('audioBalance', value)} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </SheetFrame>;
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { color: '#FFFFFF', fontSize: 14, fontFamily: 'SF-Semibold' },
  value: { color: '#B8B8C0', fontSize: 13, fontFamily: 'SF-Regular' },
  modes: { flexDirection: 'row', padding: 3, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 8, marginVertical: 12 },
  mode: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  selected: { backgroundColor: 'rgba(255,255,255,0.15)' },
  sliderRow: { paddingVertical: 6 }, readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slider: { height: 36, width: '100%' }, error: { color: '#FF9F9F', fontSize: 13, paddingVertical: 12 },
  pad: { height: 220, margin: 16, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  dotRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#85858E' },
  puck: { position: 'absolute', width: 28, height: 28, marginLeft: -14, marginTop: -14,
    borderRadius: 14, backgroundColor: '#1DB954', borderWidth: 2, borderColor: '#FFFFFF' },
  axis: { textAlign: 'center', color: '#B8B8C0', fontSize: 12 }, disabled: { opacity: 0.4 },
});
