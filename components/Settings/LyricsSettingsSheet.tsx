import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { NestedReorderableList, ScrollViewContainer, reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import Slider from '@react-native-community/slider';
import { SheetFrame, NativeIconButton } from '../native';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { LYRICS_PROVIDERS, type LyricsProviderId } from '../../services/lyrics/lyricsSources';
import type { AppSettings } from '../../services/settings/appSettings';
import { log } from '../../utils/appLogger';
import { Section, SettingsRow, Toggle, Divider } from '../gym';
import { SettingIcon } from '../gym/SettingIcon';
import { AppIcon } from '../native/AppIcon';

function ProviderPriorityRow({ id, enabled, onEnabledChange, onMove, index, disabled }: {
  id: LyricsProviderId; enabled: boolean; onEnabledChange: (enabled: boolean) => void;
  onMove: (direction: number) => void; index: number; disabled: boolean;
}) {
  const drag = useReorderableDrag();
  const name = LYRICS_PROVIDERS.find((entry) => entry.id === id)!.name;
  return <View style={styles.providerRow}>
    <View style={styles.providerCopy}>
      <SettingsRow title={name} leading={<SettingIcon name="musical-note" />}
        trailing={<Toggle label={`Ativar ${id}`} value={enabled} onValueChange={onEnabledChange} />} />
    </View>
    <Pressable accessibilityRole="adjustable" accessibilityLabel={`Reordenar ${name}`}
      accessibilityHint="Segure e arraste para mudar a prioridade" delayLongPress={300}
      disabled={disabled} accessibilityState={{ disabled }} accessibilityValue={{ text: `Prioridade ${index + 1}` }}
      accessibilityActions={[{ name: 'increment', label: 'Diminuir prioridade' }, { name: 'decrement', label: 'Aumentar prioridade' }]}
      onAccessibilityAction={({ nativeEvent }) => onMove(nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLongPress={() => { log.ui('lyrics provider drag started', { provider: id }); drag(); }}
      style={styles.dragHandle}>
      <AppIcon name="reorder-three" size={23} color="#9E9E9E" />
    </Pressable>
  </View>;
}

export const LyricsSettingsSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { settings, setSetting } = useAppSettingsStore();
  const [offset, setOffset] = React.useState(settings.lyricsOffsetMs);
  const [error, setError] = React.useState('');
  const [providerOrder, setProviderOrder] = React.useState(settings.lyricsSourceOrder);
  const [savingOrder, setSavingOrder] = React.useState(false);
  const reorderPending = React.useRef(false);
  const panGesture = React.useMemo(() => Gesture.Pan().activateAfterLongPress(320), []);
  React.useEffect(() => {
    if (!savingOrder) setProviderOrder(settings.lyricsSourceOrder);
  }, [settings.lyricsSourceOrder, savingOrder]);
  React.useEffect(() => setOffset(settings.lyricsOffsetMs), [settings.lyricsOffsetMs]);
  React.useEffect(() => {
    if (!visible) return;
    log.ui('lyrics settings sheet opened');
    return () => log.ui('lyrics settings sheet closed');
  }, [visible]);
  const change = <K extends keyof AppSettings>(key: K, value: AppSettings[K] | ((current: AppSettings[K]) => AppSettings[K])) => {
    setError(''); void setSetting(key, value).catch(() => setError('Nao foi possivel salvar o ajuste.'));
  };
  const reorder = (from: number, to: number) => {
    if (reorderPending.current || from === to || to < 0 || to >= providerOrder.length) return;
    const next = reorderItems(providerOrder, from, to);
    setProviderOrder(next);
    reorderPending.current = true;
    setSavingOrder(true);
    setError('');
    log.ui('lyrics providers reordered', { from, to, order: next });
    void setSetting('lyricsSourceOrder', next).catch((reason) => {
      log.error('lyrics provider reorder failed', reason);
      setProviderOrder(settings.lyricsSourceOrder);
      setError('Nao foi possivel salvar a prioridade.');
    }).finally(() => { reorderPending.current = false; setSavingOrder(false); });
  };
  return <SheetFrame visible={visible} size="full" title="Letras" onClose={onClose} scroll={false}>
    <GestureHandlerRootView style={styles.fill}>
    <ScrollViewContainer contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Section label="Letras">
    <SettingsRow title="Letras" leading={<SettingIcon name="chatbubble-ellipses-outline" />} trailing={<Toggle label="Letras"
      value={settings.lyricsEnabled} onValueChange={(value) => change('lyricsEnabled', value)} />} />
    <Divider />
    <SettingsRow title="Preferir sincronizadas" leading={<SettingIcon name="pulse" />} trailing={<Toggle label="Preferir letras sincronizadas"
      value={settings.lyricsPreferSynced} onValueChange={(value) => change('lyricsPreferSynced', value)} />} />
    <Divider />
    <SettingsRow title="Destaque por palavra" leading={<SettingIcon name="sparkles" />} trailing={<Toggle label="Destaque por palavra"
      value={settings.lyricsWordHighlight} onValueChange={(value) => change('lyricsWordHighlight', value)} />} />
    <Divider />
    <SettingsRow title="Rolagem automatica" leading={<SettingIcon name="list" />} trailing={<Toggle label="Rolagem automatica da letra"
      value={settings.lyricsAutoScroll} onValueChange={(value) => change('lyricsAutoScroll', value)} />} />
    </Section>
    <View style={styles.row}><Text style={styles.label}>Tamanho da letra</Text><Text style={styles.value}>{settings.lyricsFontSize}</Text></View>
    <Slider accessibilityLabel="Tamanho da letra" minimumValue={18} maximumValue={34} step={1}
      value={settings.lyricsFontSize} onSlidingComplete={(value) => change('lyricsFontSize', value)}
      minimumTrackTintColor="#1DB954" maximumTrackTintColor="#55555B" thumbTintColor="#FFFFFF" style={styles.slider} />
    <View style={styles.row}><Text style={styles.label}>Atraso da letra</Text><Text style={styles.value}>{offset} ms</Text>
      <NativeIconButton label="Zerar atraso" iconName="refresh" systemImage="arrow.counterclockwise"
        onPress={() => change('lyricsOffsetMs', 0)} /></View>
    <Slider accessibilityLabel="Atraso da letra em milissegundos" minimumValue={-10000} maximumValue={10000} step={50}
      value={offset} onValueChange={setOffset} onSlidingComplete={(value) => change('lyricsOffsetMs', value)}
      minimumTrackTintColor="#1DB954" maximumTrackTintColor="#55555B" thumbTintColor="#FFFFFF" style={styles.slider} />
    <Section label="Prioridade dos provedores">
      <NestedReorderableList testID="lyrics-priority-list" data={providerOrder} keyExtractor={(id) => id} dragEnabled={!savingOrder} panGesture={panGesture}
        ItemSeparatorComponent={Divider} onReorder={({ from, to }) => reorder(from, to)}
        renderItem={({ item, index }) => <ProviderPriorityRow id={item} index={index} disabled={savingOrder}
          onMove={(direction) => reorder(index, index + direction)}
          enabled={!settings.lyricsDisabledSources.includes(item)}
          onEnabledChange={(enabled) => change('lyricsDisabledSources', (current) => enabled
            ? current.filter((source) => source !== item) : [...current, item])} />} />
    </Section>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollViewContainer>
    </GestureHandlerRootView>
  </SheetFrame>;
};
const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { gap: 16, paddingVertical: 16, paddingBottom: 36 },
  providerRow: { flexDirection: 'row', alignItems: 'center' },
  providerCopy: { flex: 1, minWidth: 0 }, dragHandle: { width: 44, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: '#FFFFFF', fontSize: 14, flexShrink: 1, fontFamily: 'SF-Semibold' },
  value: { flex: 1, textAlign: 'right', color: '#AAAAB3', fontSize: 13 },
  slider: { width: '100%', height: 44 },
  error: { color: '#FF9F9F', fontSize: 13, paddingVertical: 12 },
});
