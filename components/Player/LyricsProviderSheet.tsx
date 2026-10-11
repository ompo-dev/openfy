import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SheetFrame, AppIcon, LoggedPressable, NativeIconButton } from '../native';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { LYRICS_PROVIDERS, lyricsProviderName, type LyricsProviderSelection } from '../../services/lyrics/lyricsSources';

export const LyricsProviderSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const track = usePlayerStore((state) => state.currentTrack);
  const selected = usePlayerStore((state) => state.lyricsProvider);
  const attempts = usePlayerStore((state) => state.lyricsProviderAttempts);
  const lyrics = usePlayerStore((state) => state.lyricsData);
  const disabled = useAppSettingsStore((state) => state.settings.lyricsDisabledSources);
  const enabled = useAppSettingsStore((state) => state.settings.lyricsEnabled);
  const order = useAppSettingsStore((state) => state.settings.lyricsSourceOrder);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setError(''); }, [track?.spotifyId, visible]);
  const select = (provider: LyricsProviderSelection) => {
    setError('');
    void usePlayerStore.getState().selectLyricsProvider(provider).catch(() => setError('Nao foi possivel salvar a escolha.'));
  };
  return <SheetFrame visible={visible} title="Provedor da letra" onClose={onClose}
    artworkURL={track?.imageURL} headerTrailing={<NativeIconButton label="Buscar letra novamente"
      systemImage="arrow.clockwise" iconName="refresh" onPress={() => void usePlayerStore.getState().refreshLyrics(true)} />}>
    <LoggedPressable accessibilityRole="radio" accessibilityState={{ checked: selected === 'auto' }}
      accessibilityLabel="Provedor automatico" onPress={() => select('auto')} style={styles.row}>
      <AppIcon name="sparkles" color="#FFFFFF" size={22} />
      <View style={styles.copy}><Text style={styles.name}>Automatico</Text>
        <Text style={styles.detail}>{lyrics ? lyricsProviderName(lyrics.source) : enabled ? 'Sem letra disponivel' : 'Letras desativadas'}</Text></View>
      {selected === 'auto' ? <AppIcon name="checkmark" color="#1DB954" size={22} /> : null}
    </LoggedPressable>
    {order.map((id) => {
      const provider = LYRICS_PROVIDERS.find((entry) => entry.id === id)!;
      const unavailable = !enabled || disabled.includes(id);
      const status = unavailable ? 'Desativado' : attempts[id] === 'loading' ? 'Buscando' :
        attempts[id] === 'cancelled' ? 'Busca cancelada' :
        attempts[id] === 'missing' ? 'Letra nao encontrada' : attempts[id] === 'error' ? 'Falha no provedor' :
          lyrics?.source === id ? lyrics.isSynced ? lyrics.segments.some((line) => line.words?.length) ? 'Por palavra' : 'Sincronizada' : 'Texto' :
            attempts[id] === 'found' ? 'Disponivel' : provider.timing === 'word' ? 'Palavras / linhas' : provider.timing === 'line' ? 'Linhas' : 'Texto';
      return <LoggedPressable key={id} accessibilityRole="radio" accessibilityLabel={provider.name}
        accessibilityState={{ checked: selected === id, disabled: unavailable }} disabled={unavailable}
        onPress={() => select(id)} style={[styles.row, unavailable && styles.disabled]}>
        <AppIcon name="musical-note" color="#D0D0D5" size={21} />
        <View style={styles.copy}><Text style={styles.name}>{provider.name}</Text><Text style={styles.detail}>{status}</Text></View>
        {attempts[id] === 'loading' ? <ActivityIndicator color="#FFFFFF" /> : selected === id ?
          <AppIcon name="checkmark" color="#1DB954" size={22} /> : null}
      </LoggedPressable>;
    })}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </SheetFrame>;
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  copy: { flex: 1, minWidth: 0 }, name: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  detail: { color: '#B6B6BD', fontSize: 12, marginTop: 4 }, disabled: { opacity: 0.45 },
  error: { color: '#FF8585', paddingVertical: 12, fontSize: 13 },
});
