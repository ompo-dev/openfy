import * as React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SheetFrame, NativeIconButton } from '../native';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { LYRICS_PROVIDERS, type LyricsProviderId } from '../../services/lyrics/lyricsSources';
import type { AppSettings } from '../../services/settings/appSettings';
import { log } from '../../utils/appLogger';

export const LyricsSettingsSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { settings, setSetting } = useAppSettingsStore();
  const [offset, setOffset] = React.useState(settings.lyricsOffsetMs);
  const [error, setError] = React.useState('');
  React.useEffect(() => setOffset(settings.lyricsOffsetMs), [settings.lyricsOffsetMs]);
  React.useEffect(() => {
    if (!visible) return;
    log.ui('lyrics settings sheet opened');
    return () => log.ui('lyrics settings sheet closed');
  }, [visible]);
  const change = <K extends keyof AppSettings>(key: K, value: AppSettings[K] | ((current: AppSettings[K]) => AppSettings[K])) => {
    setError(''); void setSetting(key, value).catch(() => setError('Nao foi possivel salvar o ajuste.'));
  };
  const move = (id: LyricsProviderId, direction: number) => change('lyricsSourceOrder', (current) => {
    const order = [...current];
    const index = order.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return order;
  });
  return <SheetFrame visible={visible} title="Letras" onClose={onClose}>
    <View style={styles.row}><Text style={styles.label}>Letras</Text><Switch accessibilityLabel="Letras"
      value={settings.lyricsEnabled} onValueChange={(value) => change('lyricsEnabled', value)} /></View>
    <View style={styles.row}><Text style={styles.label}>Preferir sincronizadas</Text><Switch accessibilityLabel="Preferir letras sincronizadas"
      value={settings.lyricsPreferSynced} onValueChange={(value) => change('lyricsPreferSynced', value)} /></View>
    <View style={styles.row}><Text style={styles.label}>Atraso da letra</Text><Text style={styles.value}>{offset} ms</Text>
      <NativeIconButton label="Zerar atraso" iconName="refresh" systemImage="arrow.counterclockwise"
        onPress={() => change('lyricsOffsetMs', 0)} /></View>
    <Slider accessibilityLabel="Atraso da letra em milissegundos" minimumValue={-10000} maximumValue={10000} step={50}
      value={offset} onValueChange={setOffset} onSlidingComplete={(value) => change('lyricsOffsetMs', value)}
      minimumTrackTintColor="#1DB954" maximumTrackTintColor="#55555B" thumbTintColor="#FFFFFF" style={styles.slider} />
    <Text style={styles.heading}>Prioridade dos provedores</Text>
    {settings.lyricsSourceOrder.map((id, index) => <View key={id} style={styles.row}>
      <Text style={styles.rank}>{index + 1}</Text>
      <Text style={[styles.label, styles.copy]}>{LYRICS_PROVIDERS.find((entry) => entry.id === id)!.name}</Text>
      <View style={styles.arrows}>
        {index > 0 ? <NativeIconButton label={`Aumentar prioridade de ${id}`} iconName="arrow-up" systemImage="arrow.up"
          size={30} onPress={() => move(id, -1)} /> : <View style={styles.spacer} />}
        {index < settings.lyricsSourceOrder.length - 1 ? <NativeIconButton label={`Diminuir prioridade de ${id}`}
          iconName="arrow-down" systemImage="arrow.down" size={30} onPress={() => move(id, 1)} /> : <View style={styles.spacer} />}
      </View>
      <Switch accessibilityLabel={`Ativar ${id}`} value={!settings.lyricsDisabledSources.includes(id)}
        onValueChange={(enabled) => change('lyricsDisabledSources', (current) => enabled
          ? current.filter((source) => source !== id) : [...current, id])} />
    </View>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </SheetFrame>;
};
const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: '#FFFFFF', fontSize: 14, flexShrink: 1, fontFamily: 'SF-Semibold' },
  copy: { flex: 1 }, rank: { width: 16, color: '#AAAAB3', fontSize: 12 },
  value: { flex: 1, textAlign: 'right', color: '#AAAAB3', fontSize: 13 },
  heading: { color: '#AAAAB3', fontSize: 13, paddingTop: 20, paddingBottom: 10 },
  slider: { width: '100%', height: 44 }, arrows: { flexDirection: 'row', gap: 3 }, spacer: { width: 30, height: 30 },
  error: { color: '#FF9F9F', fontSize: 13, paddingVertical: 12 },
});
